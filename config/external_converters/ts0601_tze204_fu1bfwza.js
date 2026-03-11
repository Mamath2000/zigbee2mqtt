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
// dp 107: energy_all      (value, ro) kWh, scale 1

const MODES = ['off', 'eco', 'comfort', 'program', 'hors_gel', 'holiday'];

// Observed on this device variant:
// 0=comfort, 1=eco, 2=hors_gel, 4=holiday, 5=program
const modeDpToStr = {0: 'comfort', 1: 'eco', 2: 'hors_gel', 4: 'holiday', 5: 'program'};
const modeStrToDp = {eco: 1, comfort: 0, program: 5, hors_gel: 2, holiday: 4};

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

const fzLocal = {
    cluster: 'manuSpecificTuya',
    type: ['commandDataResponse', 'commandDataReport', 'commandActiveStatusReport'],
    convert: (model, msg) => {
        const result = {};
        const dpValues = msg.data && msg.data.dpValues ? msg.data.dpValues : [];

        for (const dpValue of dpValues) {
            const dp = dpValue.dp;
            const dt = dpValue.datatype;
            const data = normalizeData(dpValue.data);

            if (dt === 1) { // bool
                if (dp === 1) {
                    const isOn = data[0] === 1;
                    if (!isOn) result.preset = 'off';
                }
            } else if (dt === 2) { // 32-bit signed value
                const raw = readUint32(data);
                // treat as signed
                const v = raw > 0x7FFFFFFF ? raw - 0x100000000 : raw;
                if (dp === 16) result.temp_current = decodeTempCurrent(v);
                else if (dp === 19) result.local_temperature_calibration = v;
                else if (dp === 20) result.fault = v;
                else if (dp === 24) result.holiday_temperature = v / 10;
                else if (dp === 50) result.current_heating_setpoint = v / 10;
                else if (dp === 101) {
                    const voltage = v / 10;
                    if (isValidVoltage(voltage)) result.voltage = voltage;
                } else if (dp === 102) {
                    if (isValidCurrent(v)) result.current = v;
                }
                else if (dp === 107) result.energy = v / 10;
                else if (dp === 116) result.hors_temperature = v / 10;
                else if (dp === 117) result.eco_temperature = v / 10;
            } else if (dt === 4) { // enum
                const v = data[0];
                if (dp === 2) result.preset = modeDpToStr[v] ?? `mode_${v}`;
            }
        }

        return result;
    },
};

const tzLocal = {
    preset: {
        key: ['preset'],
        convertSet: async (entity, key, value, meta) => {
            const normalizedValue = String(value).toLowerCase();
            const aliasMap = {
                hors: 'hors_gel',
                'hors-gel': 'hors_gel',
                holidays: 'holiday',
                manual: 'holiday',
            };
            const mapped = aliasMap[normalizedValue] ?? normalizedValue;
            if (mapped === 'off') {
                await tuya.sendDataPointBool(entity, 1, false);
                return {};
            }
            const dpEnum = modeStrToDp[mapped];
            if (dpEnum === undefined) throw new Error(`Invalid preset: ${value}`);
            // Ensure thermostat is powered before setting mode.
            await tuya.sendDataPointBool(entity, 1, true);
            await new Promise((resolve) => setTimeout(resolve, 300));
            await tuya.sendDataPointEnum(entity, 2, dpEnum);
            // Wait for device report (dp2) instead of optimistic state to keep UI synced with real LED state.
            return {};
        },
    },
    current_heating_setpoint: {
        key: ['current_heating_setpoint'],
        convertSet: async (entity, key, value, meta) => {
            await tuya.sendDataPointValue(entity, 50, Math.round(value * 10));
            return {state: {current_heating_setpoint: value}};
        },
    },
    holiday_temperature: {
        key: ['holiday_temperature'],
        convertSet: async (entity, key, value, meta) => {
            await tuya.sendDataPointValue(entity, 24, Math.round(value * 10));
            return {state: {holiday_temperature: value}};
        },
    },
    eco_temperature: {
        key: ['eco_temperature'],
        convertSet: async (entity, key, value, meta) => {
            await tuya.sendDataPointValue(entity, 117, Math.round(value * 10));
            return {state: {eco_temperature: value}};
        },
    },
    hors_temperature: {
        key: ['hors_temperature'],
        convertSet: async (entity, key, value, meta) => {
            await tuya.sendDataPointValue(entity, 116, Math.round(value * 10));
            return {state: {hors_temperature: value}};
        },
    },
    local_temperature_calibration: {
        key: ['local_temperature_calibration'],
        convertSet: async (entity, key, value, meta) => {
            await tuya.sendDataPointValue(entity, 19, Math.round(value));
            return {state: {local_temperature_calibration: value}};
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
    onEvent: tuya.onEventSetTime,
    configure: tuya.configureMagicPacket,
    exposes: [
        e.numeric('temp_current', e.access.STATE).withUnit('°C').withDescription('Température mesurée (dp_16)'),
        e.numeric('current_heating_setpoint', e.access.STATE_SET).withUnit('°C').withValueMin(5).withValueMax(40).withValueStep(0.5).withDescription('Consigne température'),
        e.enum('preset', e.access.STATE_SET, MODES).withDescription('Mode de fonctionnement'),
        e.numeric('holiday_temperature', e.access.STATE_SET).withUnit('°C').withValueMin(5).withValueMax(40).withValueStep(0.5).withDescription('Consigne mode vacances'),
        e.numeric('eco_temperature', e.access.STATE_SET).withUnit('°C').withValueMin(5).withValueMax(40).withValueStep(0.5).withDescription('Consigne mode éco'),
        e.numeric('hors_temperature', e.access.STATE_SET).withUnit('°C').withValueMin(5).withValueMax(40).withValueStep(0.5).withDescription('Consigne hors-gel'),
        e.numeric('local_temperature_calibration', e.access.STATE_SET).withUnit('°C').withValueMin(-9).withValueMax(9).withValueStep(1).withDescription('Correction température'),
        e.numeric('voltage', e.access.STATE).withUnit('V').withDescription('Tension'),
        e.numeric('current', e.access.STATE).withUnit('mA').withDescription('Courant'),
        e.numeric('energy', e.access.STATE).withUnit('kWh').withDescription('Énergie totale consommée'),
        e.numeric('fault', e.access.STATE).withDescription('Code de défaut'),
    ],
};
