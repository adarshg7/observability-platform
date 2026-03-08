from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, DeclarativeBase
from sqlalchemy.pool import NullPool
from app.config import settings

# SQLite does not support connection pooling — guard pool args accordingly
_is_sqlite = settings.DATABASE_URL.startswith("sqlite")

if _is_sqlite:
    # NullPool: no connection reuse — correct for SQLite (especially in tests)
    engine = create_engine(
        settings.DATABASE_URL,
        connect_args={"check_same_thread": False},
        poolclass=NullPool,
        echo=False   # silenced — SQL flood from 5s polling makes terminal unreadable
    )
else:
    engine = create_engine(
        settings.DATABASE_URL,
        pool_pre_ping=True,
        pool_size=5,
        max_overflow=10,
        echo=False   # silenced — SQL flood from 5s polling makes terminal unreadable
    )

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

class Base(DeclarativeBase):
    pass

def get_db():
    db= SessionLocal()
    try:
        yield db
    finally:
        db.close()
    
