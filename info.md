id-tuya:  bff47c5d604e5760d9g8fk
{
  "result": [
    {
      "active_time": 1759358431,
      "bind_space_id": "33169723",
      "category": "wk",
      "create_time": 1740747203,
      "custom_name": "",
      "icon": "smart/icon/ay1547110530245tcZgC/6277b957dabb0fb038f5ff6b8d06f077.png",
      "id": "bff47c5d604e5760d9g8fk",
      "ip": "",
      "is_online": false,
      "lat": "0",
      "local_key": "",
      "lon": "0",
      "model": "pl_01",
      "name": "FP Thermostat 3",
      "product_id": "fu1bfwza",
      "product_name": "FP Thermostat",
      "sub": true,
      "time_zone": "+01:00",
      "update_time": 1759358431,
      "uuid": "a4c1388293650847"
    }
  ],
  "success": true,
  "t": 1773189185225,
  "tid": "de7ebca91ce111f18255b6b5e3717ca9"
}

---

Mapping Zigbee2MQTT verifie via APIs Tuya (TS0601 / _TZE204_fu1bfwza)

- dp_1 (bool): `switch`
- dp_2 (enum): `mode` (comfort, eco, hors, off, holiday, program, manual, comfort_1, comfort_2)
- dp_11 (value, scale 1): `work_power` (W)
- dp_16 (value, scale 1): `temp_current` (°C)
- dp_17 (enum): `window_state` (close/open)
- dp_19 (value): `temp_correction`
- dp_20 (bitmap): `fault`
- dp_24 (value, scale 1): `holiday_temp_set` (°C)
- dp_29 (bool): `window_check`
- dp_39 (bool): `child_lock`
- dp_50 (value, scale 1): `temp_set` (°C)
- dp_101 (value, scale 1): `cur_voltage` (V)
- dp_102 (value, scale 0): `cur_current` (mA)
- dp_107 (value, scale 1): `energy_all` (kWh)

Notes de validation en cours cote Zigbee:

1) `dp_16` publie bien `temp_current` (ex: 2320/2290 pour la tension sont sur dp_101, pas la temperature).
2) `dp_101` publie bien `cur_voltage` (ex: 2310 -> 231 V).
3) `dp_102` ne correspond pas a `holiday_temp_set`, c'est `cur_current`.
4) `dp_107` ne correspond pas a `fault`, c'est `energy_all`.

Commande utile pour observer rapidement:

docker compose logs zigbee --since 3m | grep -E "0xa4c1388293650847|commandDataResponse|MQTT publish: topic 'zigbee2mqtt/0xa4c1388293650847'"

{
  "result": {
    "category": "wk",
    "functions": [
      {
        "code": "switch",
        "desc": "{}",
        "name": "开关",
        "type": "Boolean",
        "values": "{}"
      },
      {
        "code": "mode",
        "desc": "{\"range\":[\"eco\",\"holiday\",\"program\",\"manual\"]}",
        "name": "工作模式",
        "type": "Enum",
        "values": "{\"range\":[\"eco\",\"holiday\",\"program\",\"manual\"]}"
      },
      {
        "code": "temp_correction",
        "desc": "{\"min\":-9,\"max\":9,\"scale\":0,\"step\":1}",
        "name": "温度校准",
        "type": "Integer",
        "values": "{\"min\":-9,\"max\":9,\"scale\":0,\"step\":1}"
      },
      {
        "code": "holiday_temp_set",
        "desc": "{\"unit\":\"℃\",\"min\":50,\"max\":400,\"scale\":1,\"step\":5}",
        "name": "假日模式温度设置",
        "type": "Integer",
        "values": "{\"unit\":\"℃\",\"min\":50,\"max\":400,\"scale\":1,\"step\":5}"
      },
      {
        "code": "window_check",
        "desc": "{}",
        "name": "开窗检测",
        "type": "Boolean",
        "values": "{}"
      },
      {
        "code": "child_lock",
        "desc": "{}",
        "name": "童锁",
        "type": "Boolean",
        "values": "{}"
      },
      {
        "code": "temp_set",
        "desc": "{\"unit\":\"℃\",\"min\":50,\"max\":400,\"scale\":1,\"step\":5}",
        "name": "温度设置",
        "type": "Integer",
        "values": "{\"unit\":\"℃\",\"min\":50,\"max\":400,\"scale\":1,\"step\":5}"
      }
    ],
    "status": [
      {
        "code": "switch",
        "name": "开关",
        "type": "Boolean",
        "values": "{}"
      },
      {
        "code": "mode",
        "name": "工作模式",
        "type": "Enum",
        "values": "{\"range\":[\"eco\",\"holiday\",\"program\",\"manual\"]}"
      },
      {
        "code": "work_power",
        "name": "当前功率",
        "type": "Integer",
        "values": "{\"unit\":\"w\",\"min\":0,\"max\":50000,\"scale\":1,\"step\":1}"
      },
      {
        "code": "temp_current",
        "name": "当前温度",
        "type": "Integer",
        "values": "{\"unit\":\"℃\",\"min\":-100,\"max\":5000,\"scale\":1,\"step\":1}"
      },
      {
        "code": "window_state",
        "name": "窗户状态",
        "type": "Enum",
        "values": "{\"range\":[\"close\",\"open\"]}"
      },
      {
        "code": "temp_correction",
        "name": "温度校准",
        "type": "Integer",
        "values": "{\"min\":-9,\"max\":9,\"scale\":0,\"step\":1}"
      },
      {
        "code": "fault",
        "name": "故障告警",
        "type": "Bitmap",
        "values": "{\"label\":[\"e1\",\"e2\",\"e3\"]}"
      },
      {
        "code": "holiday_temp_set",
        "name": "假日模式温度设置",
        "type": "Integer",
        "values": "{\"unit\":\"℃\",\"min\":50,\"max\":400,\"scale\":1,\"step\":5}"
      },
      {
        "code": "window_check",
        "name": "开窗检测",
        "type": "Boolean",
        "values": "{}"
      },
      {
        "code": "child_lock",
        "name": "童锁",
        "type": "Boolean",
        "values": "{}"
      },
      {
        "code": "temp_set",
        "name": "温度设置",
        "type": "Integer",
        "values": "{\"unit\":\"℃\",\"min\":50,\"max\":400,\"scale\":1,\"step\":5}"
      }
    ]
  },
  "success": true,
  "t": 1773189368334,
  "tid": "4baae8111ce211f18255b6b5e3717ca9"
}

{
  "result": {
    "category": "wk",
    "functions": [
      {
        "code": "switch",
        "desc": "switch",
        "name": "switch",
        "type": "Boolean",
        "values": "{}"
      },
      {
        "code": "mode",
        "desc": "mode",
        "name": "mode",
        "type": "Enum",
        "values": "{\"range\":[\"eco\",\"holiday\",\"program\",\"manual\"]}"
      },
      {
        "code": "temp_correction",
        "desc": "temp correction",
        "name": "temp correction",
        "type": "Integer",
        "values": "{\"min\":-9,\"max\":9,\"scale\":0,\"step\":1}"
      },
      {
        "code": "holiday_temp_set",
        "desc": "holiday temp set",
        "name": "holiday temp set",
        "type": "Integer",
        "values": "{\"unit\":\"℃\",\"min\":50,\"max\":400,\"scale\":1,\"step\":5}"
      },
      {
        "code": "window_check",
        "desc": "window check",
        "name": "window check",
        "type": "Boolean",
        "values": "{}"
      },
      {
        "code": "child_lock",
        "desc": "child lock",
        "name": "child lock",
        "type": "Boolean",
        "values": "{}"
      },
      {
        "code": "temp_set",
        "desc": "temp set",
        "name": "temp set",
        "type": "Integer",
        "values": "{\"unit\":\"℃\",\"min\":50,\"max\":400,\"scale\":1,\"step\":5}"
      }
    ]
  },
  "success": true,
  "t": 1773189388838,
  "tid": "57e3997e1ce211f18255b6b5e3717ca9"
}
