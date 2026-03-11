const tuya = require('zigbee-herdsman-converters/lib/tuya');
const e = require('zigbee-herdsman-converters/lib/exposes');
const reporting = require('zigbee-herdsman-converters/lib/reporting');

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

const MODES = ['comfort', 'eco', 'hors', 'off', 'holiday', 'program', 'manual', 'comfort_1', 'comfort_2'];

// enum datatype: Tuya sends index; map index <-> string
const modeIndexToStr = (idx) => MODES[idx] ?? String(idx);
const modeStrToIndex = (str) => MODES.indexOf(str);

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
                const v = data[0] === 1;
                if (dp === 1) result.state = v ? 'ON' : 'OFF';
                else if (dp === 29) result.window_check = v;
                else if (dp === 39) result.child_lock = v;
            } else if (dt === 2) { // 32-bit signed value
                const raw = readUint32(data);
                // treat as signed
                const v = raw > 0x7FFFFFFF ? raw - 0x100000000 : raw;
                if (dp === 11) result.work_power = v / 10;
                else if (dp === 16) result.local_temperature = v / 10;
                else if (dp === 19) result.local_temperature_calibration = v;
                else if (dp === 20) result.fault = v;
                else if (dp === 24) result.holiday_temperature = v / 10;
                else if (dp === 50) result.current_heating_setpoint = v / 10;
                else if (dp === 101) result.voltage = v / 10;
                else if (dp === 102) result.current = v;
                else if (dp === 104) result.energy_today = v / 10;
                else if (dp === 105) result.energy_yesterday = v / 10;
                else if (dp === 107) result.energy = v / 10;
                else if (dp === 116) result.hors_temperature = v / 10;
                else if (dp === 117) result.eco_temperature = v / 10;
            } else if (dt === 4) { // enum
                const v = data[0];
                if (dp === 2) result.preset = modeIndexToStr(v);
                else if (dp === 17) result.window_open = v === 1;
            }
        }

        return result;
    },
};

const tzLocal = {
    state: {
        key: ['state'],
        convertSet: async (entity, key, value, meta) => {
            await tuya.sendDataPointBool(entity, 1, value === 'ON', 'sendData', 1);
            return {state: {state: value}};
        },
    },
    preset: {
        key: ['preset'],
        convertSet: async (entity, key, value, meta) => {
            const idx = modeStrToIndex(value);
            if (idx === -1) throw new Error(`Invalid preset: ${value}`);
            await tuya.sendDataPointEnum(entity, 2, idx, 'sendData', 1);
            return {state: {preset: value}};
        },
    },
    current_heating_setpoint: {
        key: ['current_heating_setpoint'],
        convertSet: async (entity, key, value, meta) => {
            await tuya.sendDataPointValue(entity, 50, Math.round(value * 10), 'sendData', 1);
            return {state: {current_heating_setpoint: value}};
        },
    },
    holiday_temperature: {
        key: ['holiday_temperature'],
        convertSet: async (entity, key, value, meta) => {
            await tuya.sendDataPointValue(entity, 24, Math.round(value * 10), 'sendData', 1);
            return {state: {holiday_temperature: value}};
        },
    },
    eco_temperature: {
        key: ['eco_temperature'],
        convertSet: async (entity, key, value, meta) => {
            await tuya.sendDataPointValue(entity, 117, Math.round(value * 10), 'sendData', 1);
            return {state: {eco_temperature: value}};
        },
    },
    hors_temperature: {
        key: ['hors_temperature'],
        convertSet: async (entity, key, value, meta) => {
            await tuya.sendDataPointValue(entity, 116, Math.round(value * 10), 'sendData', 1);
            return {state: {hors_temperature: value}};
        },
    },
    local_temperature_calibration: {
        key: ['local_temperature_calibration'],
        convertSet: async (entity, key, value, meta) => {
            await tuya.sendDataPointValue(entity, 19, Math.round(value), 'sendData', 1);
            return {state: {local_temperature_calibration: value}};
        },
    },
    child_lock: {
        key: ['child_lock'],
        convertSet: async (entity, key, value, meta) => {
            await tuya.sendDataPointBool(entity, 39, value === true || value === 'LOCK', 'sendData', 1);
            return {state: {child_lock: value}};
        },
    },
    window_check: {
        key: ['window_check'],
        convertSet: async (entity, key, value, meta) => {
            await tuya.sendDataPointBool(entity, 29, value === true || value === 'ON', 'sendData', 1);
            return {state: {window_check: value}};
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
        e.switch(),
        e.numeric('local_temperature', e.access.STATE).withUnit('°C').withDescription('Température mesurée'),
        e.numeric('current_heating_setpoint', e.access.ALL).withUnit('°C').withValueMin(5).withValueMax(40).withValueStep(0.5).withDescription('Consigne température'),
        e.enum('preset', e.access.ALL, MODES).withDescription('Mode de fonctionnement'),
        e.numeric('holiday_temperature', e.access.ALL).withUnit('°C').withValueMin(5).withValueMax(40).withValueStep(0.5).withDescription('Consigne mode vacances'),
        e.numeric('eco_temperature', e.access.ALL).withUnit('°C').withValueMin(5).withValueMax(40).withValueStep(0.5).withDescription('Consigne mode éco'),
        e.numeric('hors_temperature', e.access.ALL).withUnit('°C').withValueMin(5).withValueMax(40).withValueStep(0.5).withDescription('Consigne hors-gel'),
        e.numeric('local_temperature_calibration', e.access.ALL).withUnit('°C').withValueMin(-9).withValueMax(9).withValueStep(1).withDescription('Correction température'),
        e.binary('child_lock', e.access.ALL, true, false).withDescription('Verrouillage enfant'),
        e.binary('window_check', e.access.ALL, true, false).withDescription('Détection fenêtre ouverte'),
        e.binary('window_open', e.access.STATE, true, false).withDescription('État fenêtre'),
        e.numeric('work_power', e.access.STATE).withUnit('W').withDescription('Puissance instantanée'),
        e.numeric('voltage', e.access.STATE).withUnit('V').withDescription('Tension'),
        e.numeric('current', e.access.STATE).withUnit('mA').withDescription('Courant'),
        e.numeric('energy', e.access.STATE).withUnit('kWh').withDescription('Énergie totale consommée'),
        e.numeric('energy_today', e.access.STATE).withUnit('kWh').withDescription('Énergie aujourd\'hui'),
        e.numeric('energy_yesterday', e.access.STATE).withUnit('kWh').withDescription('Énergie hier'),
        e.numeric('fault', e.access.STATE).withDescription('Code de défaut'),
        e.linkquality(),
    ],
};
