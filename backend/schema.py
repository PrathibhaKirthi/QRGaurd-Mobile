from sqlalchemy import inspect, text

from extensions import db


def ensure_dev_schema():
    db.create_all()

    inspector = inspect(db.engine)
    if "generated_qr_code" not in inspector.get_table_names():
        return

    existing_columns = {column["name"] for column in inspector.get_columns("generated_qr_code")}
    if "scan_count" not in existing_columns:
        db.session.execute(text("ALTER TABLE generated_qr_code ADD COLUMN scan_count INTEGER NOT NULL DEFAULT 0"))
        db.session.commit()
    if "qr_type" not in existing_columns:
        db.session.execute(text("ALTER TABLE generated_qr_code ADD COLUMN qr_type VARCHAR(20) NOT NULL DEFAULT 'static'"))
        db.session.commit()
