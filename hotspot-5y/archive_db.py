"""Allow separate archive jobs to share a DuckDB file with short transactions."""

from time import sleep

import duckdb


def connect_archive(database, *, read_only=False):
    for attempt in range(6):
        try:
            return duckdb.connect(str(database), read_only=read_only)
        except duckdb.IOException as error:
            message = str(error).lower()
            if attempt == 5 or not any(text in message for text in (
                "being used by another process", "conflicting lock", "could not set lock",
            )):
                raise
            sleep(attempt + 1)
