"""Convert verified provider shapes without inventing province aggregates."""

from datetime import datetime
import hashlib
import json


def weather_observations(envelope, license_status="pending"):
    if envelope.get("source_id") != "open_meteo" or envelope.get("data_kind") != "estimated":
        raise ValueError("only archive reanalysis can enter observations; forecast snapshots stay separate")
    point = envelope["requested_location"]
    location = f"point:{point['latitude']}:{point['longitude']}"
    payload = envelope["payload"]
    revision = hashlib.sha256(json.dumps(payload, sort_keys=True, ensure_ascii=False).encode()).hexdigest()
    daily = payload["daily"]
    rows = []
    for variable, measure in (("precipitation_sum", "rainfall"), ("temperature_2m_max", "temperature_max"),
                              ("et0_fao_evapotranspiration", "reference_et0")):
        if len(daily[variable]) != len(daily["time"]):
            raise ValueError("weather dates and values have different lengths")
        for day, value in zip(daily["time"], daily[variable]):
            datetime.strptime(day, "%Y-%m-%d")
            identity = f"open_meteo:era5:{location}:{day}:{variable}"
            rows.append({"observation_id": hashlib.sha256(identity.encode()).hexdigest(),
                "source_id": "open_meteo", "area_code": None, "spatial_support": "grid_point",
                "location_id": location, "commodity_id": None, "observed_at": day + "T00:00:00+07:00",
                "release_at": envelope.get("release_at"), "retrieved_at": envelope["retrieved_at"],
                "measure": measure, "value": value, "unit": payload["daily_units"][variable],
                "data_kind": "estimated", "revision_id": revision,
                "quality_flag": "missing" if value is None else "good", "source_url": envelope["request_url"],
                "license_status": license_status})
    return rows
