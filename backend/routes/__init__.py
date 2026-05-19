from routes.advanced_scan import advanced_scan_bp
from routes.public import public_bp
from routes.reports import reports_bp
from routes.scan import scan_bp


def register_routes(app):
    app.register_blueprint(public_bp)
    app.register_blueprint(scan_bp)
    app.register_blueprint(reports_bp)
    app.register_blueprint(advanced_scan_bp)
