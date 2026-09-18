"""Thin driver binding. Callers supply the private DSN; no profile or embedding defaults."""
from contextlib import asynccontextmanager


@asynccontextmanager
async def postgres_connection(database_url):
    from psycopg import AsyncConnection
    from psycopg.rows import dict_row

    async with await AsyncConnection.connect(database_url, row_factory=dict_row,
                                            autocommit=True, connect_timeout=5) as connection:
        yield connection
