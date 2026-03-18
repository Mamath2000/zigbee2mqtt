const tuya = require('zigbee-herdsman-converters/lib/tuya');
const e = require('zigbee-herdsman-converters/lib/exposes');

// DP ID => code (from Tuya QueryProperties API)
// dp 1  : switch          (bool,  rw)
// dp 2  : mode            (enum,  rw) comfort/eco/hors/off/holiday/program/manual/comfort_1/comfort_2
// dp 11 : work_power      (value, ro) W, scale 1
// dp 16 : temp_current    (value, ro) °C, scale 1
// dp 17 : window_state    (enum,  ro) close/open
// dp 19 : temp_correction (value, rw) °C, scale 0
// dp 20 : fault           (bitmap,ro) bits: e1/e2/e3
// dp 24 : holiday_temp_set(value, rw) °C, scale 1, min 5.0 max 40.0 step 0.5
// dp 29 : window_check    (bool,  rw)
// dp 39 : child_lock      (bool,  rw)
// dp 50 : temp_set        (value, rw) °C, scale 1, min 5.0 max 40.0 step 0.5
// dp 101: cur_voltage     (value, ro) V,  scale 1
// dp 102: cur_current     (value, ro) mA, scale 0
// dp 103: temp_sensitivity(value, rw) °C, scale 1
// dp 107: energy_all      (value, ro) kWh, scale 1

// Observed on this device variant:
// 0=comfort, 1=eco, 2=hors_gel, 4=no-led state, 5=program
const PRESETS = ['off', 'comfort', 'eco', 'hors_gel', 'program'];
const modeDpToStr = {0: 'comfort', 1: 'eco', 2: 'hors_gel', 4: 'off', 5: 'program'};
const modeStrToDp = {eco: 1, comfort: 0, program: 5, hors_gel: 2};
const HEAT_MODE = 'comfort';
const DEFAULT_HYSTERESIS = 0.5;
const DEFAULT_SETPOINTS = {
    comfort: 20,
    eco: 16,
    hors_gel: 8,
};

function isValidVoltage(value) {
    return value >= 100 && value <= 260;
}

function isValidCurrent(value) {
    return value >= 0 && value <= 2000;
}

function readUint32(data) {
    const padded = [0, 0, 0, 0];
    const offset = Math.max(0, 4 - data.length);
    for (let i = 0; i < Math.min(4, data.length); i++) padded[offset + i] = data[i];
    return ((padded[0] << 24) >>> 0) + ((padded[1] << 16) >>> 0) + ((padded[2] << 8) >>> 0) + (padded[3] >>> 0);
}

function normalizeData(raw) {
    if (Buffer.isBuffer(raw)) return Array.from(raw);
    if (Array.isArray(raw)) return raw;
    if (raw && Array.isArray(raw.data)) return raw.data;
    return [];
}

function decodeTempCurrent(rawValue) {
    // Tuya cloud declares dp16 as temp_current(scale=1), but some Zigbee variants
    // appear to report Fahrenheit*10. Auto-detect to provide a usable Celsius value.
    const t10 = rawValue / 10;
    if (t10 >= 45) {
        return Number((((t10 - 32) * 5) / 9).toFixed(1));
    }
    return t10;
}

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function sendVisualOff(entity, meta) {
    await tuya.sendDataPointBool(entity, 1, false);
}

async function sendHeatingOn(entity) {
    await tuya.sendDataPointBool(entity, 1, true);
    await sleep(300);
    await tuya.sendDataPointEnum(entity, 2, modeStrToDp[HEAT_MODE]);
}

function normalizePreset(value) {
    const normalizedValue = String(value ?? '').toLowerCase();
    const aliasMap = {
        hors: 'hors_gel',
        'hors-gel': 'hors_gel',
        holiday: 'off',
        holidays: 'off',
        manual: 'comfort',
        heat: 'comfort',
    };
    return aliasMap[normalizedValue] ?? normalizedValue;
}

function getControlPreset(preset) {
    return normalizePreset(preset) === 'program' ? 'comfort' : normalizePreset(preset);
}

function getEntityKey(entityOrDevice) {
    if (!entityOrDevice) return undefined;
    if (entityOrDevice.ieeeAddr) return entityOrDevice.ieeeAddr;
    if (typeof entityOrDevice.getDevice === 'function') {
        const device = entityOrDevice.getDevice();
        if (device && device.ieeeAddr) return device.ieeeAddr;
    }
    if (entityOrDevice.deviceIeeeAddress) return entityOrDevice.deviceIeeeAddress;
    return undefined;
}

function getDevice(entityOrDevice, meta) {
    if (entityOrDevice && entityOrDevice.ieeeAddr) return entityOrDevice;
    if (entityOrDevice && typeof entityOrDevice.getDevice === 'function') {
        const device = entityOrDevice.getDevice();
        if (device) return device;
    }
    if (meta && meta.device) return meta.device;
    return undefined;
}

async function sendPresetMode(entity, preset) {
    const modeDp = modeStrToDp[preset];
    if (modeDp !== undefined) {
        await tuya.sendDataPointEnum(entity, 2, modeDp);
    }
}

function extractPresetFromTuyaMessage(eventData) {
    const dpValues = eventData && eventData.data && Array.isArray(eventData.data.dpValues) ? eventData.data.dpValues : [];
    for (const dpValue of dpValues) {
        if (dpValue.dp === 2 && dpValue.datatype === 4) {
            const data = normalizeData(dpValue.data);
            if (data.length > 0) return normalizePreset(modeDpToStr[data[0]] ?? 'comfort');
        }
    }
    return undefined;
}

function getComfortSetpoint(state) {
    const comfortTemperature = Number(state.comfort_temperature);
    if (Number.isFinite(comfortTemperature) && comfortTemperature >= 5) return comfortTemperature;

    const currentHeatingSetpoint = Number(state.current_heating_setpoint);
    if (Number.isFinite(currentHeatingSetpoint) && currentHeatingSetpoint >= 5) return currentHeatingSetpoint;

    return DEFAULT_SETPOINTS.comfort;
}

function getPresetTemperatureKey(preset) {
    const controlPreset = getControlPreset(preset);
    if (controlPreset === 'comfort') return 'comfort_temperature';
    if (controlPreset === 'eco') return 'eco_temperature';
    if (controlPreset === 'hors_gel') return 'hors_temperature';
    return undefined;
}

function getPresetSetpoint(state, preset) {
    const controlPreset = getControlPreset(preset);
    if (controlPreset === 'comfort') return getComfortSetpoint(state);
    if (controlPreset === 'eco') return Number(state.eco_temperature ?? DEFAULT_SETPOINTS.eco);
    if (controlPreset === 'hors_gel') return Number(state.hors_temperature ?? DEFAULT_SETPOINTS.hors_gel);
    return getComfortSetpoint(state);
}

function applyPresetSetpointToState(state, preset) {
    const nextState = {...state};
    nextState.current_heating_setpoint = getPresetSetpoint(nextState, preset);
    return nextState;
}

function syncActivePresetTemperature(state, setpoint) {
    const nextState = {...state, current_heating_setpoint: Number(setpoint)};
    const preset = normalizePreset(nextState.preset ?? 'comfort');
    const temperatureKey = getPresetTemperatureKey(preset);

    if (temperatureKey) nextState[temperatureKey] = Number(setpoint);
    if (temperatureKey !== 'comfort_temperature') nextState.comfort_temperature = getComfortSetpoint(nextState);

    return nextState;
}

function syncStoredPresetTemperature(state, preset, setpoint) {
    const nextState = {...state};
    const temperatureKey = getPresetTemperatureKey(preset);

    if (!temperatureKey) return nextState;

    nextState[temperatureKey] = Number(setpoint);
    if (getControlPreset(nextState.preset ?? 'comfort') === getControlPreset(preset)) {
        nextState.current_heating_setpoint = Number(setpoint);
    }

    return nextState;
}

function getThermostatDecision(state) {
    const preset = normalizePreset(state.preset ?? 'comfort');
    const localTemperature = Number(state.local_temperature ?? state.temp_current);
    const previousHeating = state.running_state === 'heat' || state.device_on === true;
    const hysteresis = Number(state.hysteresis ?? DEFAULT_HYSTERESIS);

    if (preset === 'off') {
        return {preset: 'off', systemMode: 'off', heating: false};
    }

    const targetSetpoint = Number(state.current_heating_setpoint ?? getPresetSetpoint(state, preset));

    if (!Number.isFinite(localTemperature)) {
        return {
            preset,
            systemMode: 'heat',
            heating: previousHeating,
            targetSetpoint,
        };
    }

    const lowerBound = targetSetpoint - hysteresis;
    const upperBound = targetSetpoint + hysteresis;
    let heating = previousHeating;

    if (localTemperature <= lowerBound) heating = true;
    else if (localTemperature >= upperBound) heating = false;

    return {
        preset,
        systemMode: 'heat',
        heating,
        targetSetpoint,
    };
}

function updateDerivedState(result, state) {
    const decision = getThermostatDecision(state);
    if (result.current_heating_setpoint === undefined && decision.targetSetpoint !== undefined) {
        result.current_heating_setpoint = decision.targetSetpoint;
    }
    if (result.comfort_temperature === undefined) {
        result.comfort_temperature = getComfortSetpoint({...state, ...result});
    }
    if (result.hysteresis === undefined) result.hysteresis = Number(state.hysteresis ?? DEFAULT_HYSTERESIS);
    result.preset = decision.preset;
    result.system_mode = decision.systemMode;
    result.running_state = decision.heating ? 'heat' : 'idle';
}

async function applyThermostatDecision(entity, state) {
    const decision = getThermostatDecision(state);
    if (decision.heating && state.device_on !== true) await sendHeatingOn(entity);
    if (!decision.heating && state.device_on !== false) await sendVisualOff(entity);

    return {
        state: {
            current_heating_setpoint: decision.targetSetpoint,
            comfort_temperature: getComfortSetpoint(state),
            preset: decision.preset,
            running_state: decision.heating ? 'heat' : 'idle',
            system_mode: decision.systemMode,
        },
    };
}

const fzLocal = {
    cluster: 'manuSpecificTuya',
    type: ['commandDataResponse', 'commandDataReport', 'commandActiveStatusReport'],
    convert: (model, msg, publish, options, meta) => {
        const result = {};
        const dpValues = msg.data && msg.data.dpValues ? msg.data.dpValues : [];
        for (const dpValue of dpValues) {
            const dp = dpValue.dp;
            const dt = dpValue.datatype;
            const data = normalizeData(dpValue.data);

            if (dt === 1) { // bool
                if (dp === 1) {
                    result.device_on = data[0] === 1;
                }
            } else if (dt === 4) { // enum
                if (dp === 2 && data.length > 0) {
                    const preset = normalizePreset(modeDpToStr[data[0]] ?? 'comfort');
                    result.preset = preset;
                    result.system_mode = preset === 'off' ? 'off' : 'heat';
                }
            } else if (dt === 2) { // 32-bit signed value
                const raw = readUint32(data);
                // treat as signed
                const v = raw > 0x7FFFFFFF ? raw - 0x100000000 : raw;
                if (dp === 16) result.local_temperature = decodeTempCurrent(v);
                else if (dp === 19) result.local_temperature_calibration = v;
                else if (dp === 20) result.fault = v;
                else if (dp === 50 && v >= 50) {
                    result.current_heating_setpoint = v / 10;
                    result.comfort_temperature = v / 10;
                }
                else if (dp === 101) {
                    const voltage = v / 10;
                    if (isValidVoltage(voltage)) result.voltage = voltage;
                } else if (dp === 102) {
                    if (isValidCurrent(v)) result.current = v;
                } else if (dp === 103 && v >= 5) result.hysteresis = v / 10;
                else if (dp === 107) result.energy = v / 10;
                else if (dp === 116 && v >= 50) result.hors_temperature = v / 10;
                else if (dp === 117 && v >= 50) result.eco_temperature = v / 10;
            }
        }

        if (result.preset !== undefined && result.preset !== 'off' && result.current_heating_setpoint === undefined) {
            Object.assign(result, applyPresetSetpointToState({...((meta && meta.state) ? meta.state : {}), ...result}, result.preset));
        }

        // Preserve a usable climate state across restarts until the thermostat
        // reports the new keys again.
        if (result.local_temperature === undefined) {
            const fallbackLocalTemperature = meta && meta.state ? meta.state.local_temperature ?? meta.state.temp_current : undefined;
            if (typeof fallbackLocalTemperature === 'number') result.local_temperature = fallbackLocalTemperature;
        }
        if (result.preset === undefined && meta && meta.state && meta.state.preset) {
            result.preset = meta.state.preset;
        }
        if (result.system_mode === undefined && meta && meta.state) {
            if (meta.state.system_mode) result.system_mode = meta.state.system_mode;
            else if (meta.state.preset === 'off') result.system_mode = 'off';
            else if (meta.state.preset) result.system_mode = 'heat';
        }
        updateDerivedState(result, {...(meta && meta.state ? meta.state : {}), ...result});

        return result;
    },
};

const tzLocal = {
    preset: {
        key: ['preset'],
        convertSet: async (entity, key, value, meta) => {
            const mapped = normalizePreset(value);
            if (!PRESETS.includes(mapped)) throw new Error(`Invalid preset: ${value}`);
            const nextState = {...(meta.state ?? {})};
            nextState.preset = mapped;
            nextState.system_mode = mapped === 'off' ? 'off' : 'heat';
            if (mapped !== 'off') {
                Object.assign(nextState, applyPresetSetpointToState(nextState, mapped));
                await sendPresetMode(entity, mapped);
                await sleep(300);
                await tuya.sendDataPointValue(entity, 50, Math.round(Number(nextState.current_heating_setpoint) * 10));
                await sleep(300);
            }
            const result = await applyThermostatDecision(entity, nextState);
            return result;
        },
    },
    system_mode: {
        key: ['system_mode'],
        convertSet: async (entity, key, value, meta) => {
            const normalizedValue = String(value).toLowerCase();
            if (normalizedValue === 'off') {
                await sendVisualOff(entity, meta);
                return {state: {system_mode: 'off', preset: 'off', running_state: 'idle'}};
            }
            if (normalizedValue !== 'heat') {
                throw new Error(`Invalid system_mode: ${value}`);
            }
            const nextPreset = normalizePreset(meta.state?.preset ?? 'comfort');
            const nextState = {...(meta.state ?? {}), preset: nextPreset === 'off' ? 'comfort' : nextPreset, system_mode: 'heat'};
            Object.assign(nextState, applyPresetSetpointToState(nextState, nextState.preset));
            return applyThermostatDecision(entity, nextState);
        },
    },
    current_heating_setpoint: {
        key: ['current_heating_setpoint'],
        convertSet: async (entity, key, value, meta) => {
            await tuya.sendDataPointValue(entity, 50, Math.round(value * 10));
            const nextState = syncActivePresetTemperature(meta.state ?? {}, value);
            return applyThermostatDecision(entity, nextState);
        },
    },
    comfort_temperature: {
        key: ['comfort_temperature'],
        convertSet: async (entity, key, value, meta) => {
            await tuya.sendDataPointValue(entity, 50, Math.round(Number(value) * 10));
            const nextState = syncStoredPresetTemperature(meta.state ?? {}, 'comfort', value);
            return applyThermostatDecision(entity, nextState);
        },
    },
    eco_temperature: {
        key: ['eco_temperature'],
        convertSet: async (entity, key, value, meta) => {
            await tuya.sendDataPointValue(entity, 117, Math.round(value * 10));
            const nextState = syncStoredPresetTemperature(meta.state ?? {}, 'eco', value);
            if (normalizePreset(nextState.preset) === 'eco') {
                return applyThermostatDecision(entity, nextState);
            }
            return {state: {eco_temperature: Number(value)}};
        },
    },
    hors_temperature: {
        key: ['hors_temperature'],
        convertSet: async (entity, key, value, meta) => {
            await tuya.sendDataPointValue(entity, 116, Math.round(value * 10));
            const nextState = syncStoredPresetTemperature(meta.state ?? {}, 'hors_gel', value);
            if (normalizePreset(nextState.preset) === 'hors_gel') {
                return applyThermostatDecision(entity, nextState);
            }
            return {state: {hors_temperature: Number(value)}};
        },
    },
    local_temperature_calibration: {
        key: ['local_temperature_calibration'],
        convertSet: async (entity, key, value, meta) => {
            await tuya.sendDataPointValue(entity, 19, Math.round(value));
            return {state: {local_temperature_calibration: value}};
        },
    },
    hysteresis: {
        key: ['hysteresis'],
        convertSet: async (entity, key, value, meta) => {
            await tuya.sendDataPointValue(entity, 103, Math.round(Number(value) * 10));
            const nextState = {...(meta.state ?? {}), hysteresis: Number(value)};
            return applyThermostatDecision(entity, nextState);
        },
    },
};

module.exports = {
    fingerprint: [{modelID: 'TS0601', manufacturerName: '_TZE204_fu1bfwza'}],
    model: 'TS0601_fu1bfwza_custom',
    vendor: 'Tuya',
    description: 'FP Thermostat fil pilote (_TZE204_fu1bfwza)',
    fromZigbee: [fzLocal],
    toZigbee: Object.values(tzLocal),
    onEvent: async (type, data, device) => {
        if (typeof tuya.onEventSetTime === 'function') {
            await tuya.onEventSetTime(type, data, device);
        }

        if (!device) return;
        if (!device.meta) device.meta = {};
        if (!device.meta.state) device.meta.state = {};

        const eventType = typeof type === 'string' ? type : type && type.type;
        const eventData = typeof type === 'string' ? data : type && type.data;
        const eventDevice = typeof type === 'string' ? device : type && type.data ? type.data.device : device;

        if (!eventDevice || !['message', 'start', 'deviceAnnounce'].includes(eventType)) return;

        const state = eventDevice.meta && eventDevice.meta.state ? eventDevice.meta.state : {};
        const reportedPreset = eventType === 'message' ? extractPresetFromTuyaMessage(eventData) : undefined;
        const preset = normalizePreset(reportedPreset ?? state.preset ?? 'comfort');
        const localTemperature = Number(state.local_temperature ?? state.temp_current);

        if (preset === 'off' || !Number.isFinite(localTemperature)) return;

        if (eventType === 'message') {
            const cluster = eventData && eventData.cluster;
            if (cluster && cluster !== 'manuSpecificTuya') return;
        }

        const endpoint = eventDevice.getEndpoint(1);
        if (!endpoint) return;
        await applyThermostatDecision(endpoint, {...state, preset});
    },
    configure: tuya.configureMagicPacket,
    exposes: [
        e.climate()
            .withSetpoint('current_heating_setpoint', 5, 40, 0.5, e.access.STATE_SET)
            .withLocalTemperature(e.access.STATE, 'Température mesurée (dp_16)')
            .withSystemMode(['off', 'heat'], e.access.STATE_SET, 'Pilotage binaire du thermostat')
            .withRunningState(['idle', 'heat'], e.access.STATE)
            .withPreset(PRESETS, 'Sélection de la consigne active')
            .withLocalTemperatureCalibration(-9, 9, 1, e.access.STATE_SET),
        e.numeric('hysteresis', e.access.STATE_SET).withUnit('°C').withValueMin(0.5).withValueMax(5).withValueStep(0.5).withDescription('Hystérésis thermique (dp_103 temp_sensitivity)'),
        e.numeric('comfort_temperature', e.access.STATE_SET).withUnit('°C').withValueMin(5).withValueMax(40).withValueStep(0.5).withDescription('Consigne mode confort'),
        e.numeric('eco_temperature', e.access.STATE_SET).withUnit('°C').withValueMin(5).withValueMax(40).withValueStep(0.5).withDescription('Consigne mode éco'),
        e.numeric('hors_temperature', e.access.STATE_SET).withUnit('°C').withValueMin(5).withValueMax(40).withValueStep(0.5).withDescription('Consigne hors-gel'),
        e.numeric('voltage', e.access.STATE).withUnit('V').withDescription('Tension'),
        e.numeric('current', e.access.STATE).withUnit('mA').withDescription('Courant'),
        e.numeric('energy', e.access.STATE).withUnit('kWh').withDescription('Énergie totale consommée'),
        e.numeric('fault', e.access.STATE).withDescription('Code de défaut'),
    ],
};
