"""
email_service.py
================
Sends email alerts via SMTP when thresholds are breached.
Configuration is read from environment variables (never hardcoded credentials):

  EMAIL_ENABLED   = "true"   (set to enable)
  EMAIL_FROM      = "alerts@yourbank.com"
  EMAIL_TO        = "admin@yourbank.com,oncall@yourbank.com"  (comma-separated)
  SMTP_HOST       = "smtp.gmail.com"
  SMTP_PORT       = "587"
  SMTP_USER       = "alerts@yourbank.com"
  SMTP_PASSWORD   = "your-app-password"
  SMTP_USE_TLS    = "true"

All of these can also be set via the Settings page (stored in user_settings table
under keys: emailEnabled, emailFrom, emailTo, smtpHost, smtpPort, smtpUser, smtpPassword, smtpUseTls).
"""
import os
import smtplib
import logging
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from datetime import datetime, timezone

logger = logging.getLogger(__name__)

# ── Read config from env (fallbacks to empty = disabled) ─────────────
def _cfg(key: str, fallback: str = "") -> str:
    return os.environ.get(key, fallback).strip()


# #12 FIX: Cache email config with 60s TTL — avoids new DB connection per email.
# Under an alert storm (many models breaching thresholds simultaneously), the old
# code opened a PostgreSQL connection per alert email, exhausting the connection pool.
_email_cfg_cache: dict = {}
_email_cfg_fetched_at: float = 0.0
_EMAIL_CFG_TTL = 60.0   # seconds


def _email_config_from_db() -> dict:
    """Read email settings from user_settings table — cached for 60 seconds."""
    import time
    global _email_cfg_cache, _email_cfg_fetched_at

    now = time.monotonic()
    if _email_cfg_cache and (now - _email_cfg_fetched_at) < _EMAIL_CFG_TTL:
        return _email_cfg_cache   # serve from cache

    try:
        from app.database import SessionLocal
        from app.models.user_setting import UserSetting
        db   = SessionLocal()
        rows = db.query(UserSetting).filter(UserSetting.key.in_([
            "emailEnabled", "emailFrom", "emailTo",
            "smtpHost", "smtpPort", "smtpUser", "smtpPassword", "smtpUseTls"
        ])).all()
        db.close()
        _email_cfg_cache    = {r.key: r.value for r in rows}
        _email_cfg_fetched_at = now
        return _email_cfg_cache
    except Exception as e:
        logger.debug("Could not read email config from DB: %s", e)
        return _email_cfg_cache or {}   # return stale cache on DB error


def _get_config() -> dict:
    """Merge DB settings over environment variable defaults."""
    db_cfg = _email_config_from_db()
    return {
        "enabled":  (db_cfg.get("emailEnabled") or _cfg("EMAIL_ENABLED", "false")).lower() == "true",
        "from":     db_cfg.get("emailFrom")     or _cfg("EMAIL_FROM"),
        "to":       db_cfg.get("emailTo")       or _cfg("EMAIL_TO"),
        "host":     db_cfg.get("smtpHost")      or _cfg("SMTP_HOST", "smtp.gmail.com"),
        "port":     int(db_cfg.get("smtpPort")  or _cfg("SMTP_PORT", "587")),
        "user":     db_cfg.get("smtpUser")      or _cfg("SMTP_USER"),
        "password": db_cfg.get("smtpPassword")  or _cfg("SMTP_PASSWORD"),
        "use_tls":  (db_cfg.get("smtpUseTls")   or _cfg("SMTP_USE_TLS", "true")).lower() == "true",
    }



def send_alert_email(alert: dict) -> bool:
    """
    Send a single alert email.
    Returns True if sent successfully, False otherwise.
    """
    cfg = _get_config()

    if not cfg["enabled"]:
        logger.debug("Email alerts disabled — skipping")
        return False

    if not cfg["to"] or not cfg["host"]:
        logger.warning("Email config incomplete — skipping (set EMAIL_TO and SMTP_HOST)")
        return False

    recipients = [r.strip() for r in cfg["to"].split(",") if r.strip()]
    if not recipients:
        return False

    severity     = alert.get("severity", "info").upper()
    model        = alert.get("model", "Unknown")
    msg_text     = alert.get("msg", "")
    now_str      = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    alert_type   = alert.get("type", "")

    subject = f"[{severity}] {model} — Observability Alert"

    html = f"""
<html><body style="font-family:sans-serif;background:#0f172a;color:#e2e8f0;padding:24px">
<div style="max-width:560px;margin:0 auto">
  <div style="background:#1e293b;border:1px solid #334155;border-radius:12px;overflow:hidden">
    <div style="padding:16px 24px;border-bottom:1px solid #334155;background:{'#7f1d1d' if severity=='CRITICAL' else '#78350f' if severity=='WARNING' else '#1e3a5f'}">
      <span style="font-size:16px;font-weight:700;color:#fff">{'🔴' if severity=='CRITICAL' else '🟡' if severity=='WARNING' else 'ℹ️'} {severity} — {model}</span>
    </div>
    <div style="padding:20px 24px">
      <p style="font-size:14px;color:#e2e8f0;margin:0 0 16px 0">{msg_text}</p>
      <table style="width:100%;border-collapse:collapse">
        <tr><td style="padding:6px 0;font-size:12px;color:#94a3b8;width:120px">Model</td><td style="font-size:12px;color:#e2e8f0">{model}</td></tr>
        <tr><td style="padding:6px 0;font-size:12px;color:#94a3b8">Type</td><td style="font-size:12px;color:#e2e8f0">{alert_type}</td></tr>
        <tr><td style="padding:6px 0;font-size:12px;color:#94a3b8">Severity</td><td style="font-size:12px;color:#e2e8f0">{severity}</td></tr>
        <tr><td style="padding:6px 0;font-size:12px;color:#94a3b8">Time</td><td style="font-size:12px;color:#e2e8f0">{now_str}</td></tr>
      </table>
    </div>
    <div style="padding:12px 24px;border-top:1px solid #334155;font-size:11px;color:#64748b">
      Unified ML/LLM Observability Platform · Automated Alert
    </div>
  </div>
</div>
</body></html>
"""

    try:
        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject
        msg["From"]    = cfg["from"] or cfg["user"]
        msg["To"]      = ", ".join(recipients)
        msg.attach(MIMEText(f"{severity}: {model}\n{msg_text}\nTime: {now_str}", "plain"))
        msg.attach(MIMEText(html, "html"))

        if cfg["use_tls"]:
            server = smtplib.SMTP(cfg["host"], cfg["port"], timeout=10)
            server.starttls()
        else:
            server = smtplib.SMTP_SSL(cfg["host"], cfg["port"], timeout=10)

        if cfg["user"] and cfg["password"]:
            server.login(cfg["user"], cfg["password"])

        server.sendmail(msg["From"], recipients, msg.as_string())
        server.quit()
        logger.info("Alert email sent for %s to %s", model, recipients)
        return True

    except Exception as e:
        logger.warning("Failed to send alert email: %s", e)
        return False


def send_invite_email(to_email: str, to_name: str, invited_by: str, temp_password: str) -> bool:
    """
    Send a user invitation email with their temporary password.
    Returns True if sent successfully.
    """
    cfg = _get_config()

    if not cfg["host"] or not (cfg["user"] or cfg["from"]):
        logger.warning("SMTP not configured — skipping invite email (configure SMTP in Settings)")
        return False

    recipients = [to_email]
    subject     = "You've been invited to ObserveML"
    login_url   = "http://localhost:5173/login"

    html = f"""
<html><body style="font-family:sans-serif;background:#0f172a;color:#e2e8f0;padding:24px">
<div style="max-width:560px;margin:0 auto">
  <div style="background:#1e293b;border:1px solid #334155;border-radius:12px;overflow:hidden">
    <div style="padding:16px 24px;border-bottom:1px solid #334155;background:linear-gradient(135deg,#1e40af,#6d28d9)">
      <span style="font-size:18px;font-weight:700;color:#fff">🚀 Welcome to ObserveML</span>
    </div>
    <div style="padding:24px">
      <p style="font-size:15px;color:#e2e8f0;margin:0 0 16px 0">
        Hi <strong>{to_name}</strong>,
      </p>
      <p style="font-size:14px;color:#cbd5e1;margin:0 0 24px 0">
        <strong>{invited_by}</strong> has invited you to join the ObserveML platform.
        Use the credentials below to log in and set a new password.
      </p>
      <div style="background:#0f172a;border:1px solid #334155;border-radius:8px;padding:16px;margin-bottom:24px">
        <p style="font-size:12px;color:#94a3b8;margin:0 0 6px 0">Login Email</p>
        <p style="font-size:15px;color:#60a5fa;margin:0 0 16px 0;font-family:monospace">{to_email}</p>
        <p style="font-size:12px;color:#94a3b8;margin:0 0 6px 0">Temporary Password</p>
        <p style="font-size:16px;color:#34d399;margin:0;font-family:monospace;letter-spacing:1px">{temp_password}</p>
      </div>
      <a href="{login_url}" style="display:inline-block;background:linear-gradient(135deg,#1e40af,#6d28d9);
         color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px">
        🔐 Log In Now
      </a>
      <p style="font-size:12px;color:#64748b;margin:24px 0 0 0">
        Please change your password after your first login. If you did not expect this invitation, ignore this email.
      </p>
    </div>
    <div style="padding:12px 24px;border-top:1px solid #334155;font-size:11px;color:#64748b">
      Unified ML/LLM Observability Platform · Automated Invite
    </div>
  </div>
</div>
</body></html>
"""

    try:
        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject
        msg["From"]    = cfg["from"] or cfg["user"]
        msg["To"]      = to_email
        msg.attach(MIMEText(
            f"You've been invited to ObserveML by {invited_by}.\n"
            f"Email: {to_email}\nTemp password: {temp_password}\nLogin: {login_url}", "plain"))
        msg.attach(MIMEText(html, "html"))

        if cfg["use_tls"]:
            server = smtplib.SMTP(cfg["host"], cfg["port"], timeout=10)
            server.starttls()
        else:
            server = smtplib.SMTP_SSL(cfg["host"], cfg["port"], timeout=10)

        if cfg["user"] and cfg["password"]:
            server.login(cfg["user"], cfg["password"])

        server.sendmail(msg["From"], recipients, msg.as_string())
        server.quit()
        logger.info("Invite email sent to %s", to_email)
        return True

    except Exception as e:
        logger.warning("Failed to send invite email to %s: %s", to_email, e)
        return False


def _send_simple(to_email: str, subject: str, html: str, plain: str) -> bool:
    """Internal helper — sends an email using current SMTP config."""
    cfg = _get_config()
    if not cfg["host"] or not (cfg["user"] or cfg["from"]):
        logger.warning("SMTP not configured — skipping email to %s", to_email)
        return False
    try:
        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject
        msg["From"]    = cfg["from"] or cfg["user"]
        msg["To"]      = to_email
        msg.attach(MIMEText(plain, "plain"))
        msg.attach(MIMEText(html, "html"))

        if cfg["use_tls"]:
            server = smtplib.SMTP(cfg["host"], cfg["port"], timeout=10)
            server.starttls()
        else:
            server = smtplib.SMTP_SSL(cfg["host"], cfg["port"], timeout=10)

        if cfg["user"] and cfg["password"]:
            server.login(cfg["user"], cfg["password"])

        server.sendmail(msg["From"], [to_email], msg.as_string())
        server.quit()
        logger.info("Email sent to %s: %s", to_email, subject)
        return True
    except Exception as e:
        logger.warning("Email to %s failed: %s", to_email, e)
        return False


def send_registration_request_email(
    admin_email: str, applicant_name: str, applicant_email: str, user_id: str
) -> bool:
    """Notify admin that a new user is awaiting approval."""
    approve_url = f"http://localhost:5173/admin?tab=pending"
    html = f"""
<html><body style="font-family:sans-serif;background:#0f172a;color:#e2e8f0;padding:24px">
<div style="max-width:560px;margin:0 auto;background:#1e293b;border:1px solid #334155;border-radius:12px;overflow:hidden">
  <div style="padding:16px 24px;background:linear-gradient(135deg,#1e40af,#6d28d9);border-bottom:1px solid #334155">
    <span style="font-size:16px;font-weight:700;color:#fff">🔔 New Registration Request</span>
  </div>
  <div style="padding:24px">
    <p style="color:#cbd5e1;margin:0 0 16px">A new user is waiting for your approval to join ObserveML:</p>
    <div style="background:#0f172a;border:1px solid #334155;border-radius:8px;padding:16px;margin-bottom:20px">
      <p style="margin:0 0 6px;font-size:12px;color:#94a3b8">Name</p>
      <p style="margin:0 0 14px;color:#f1f5f9;font-weight:500">{applicant_name}</p>
      <p style="margin:0 0 6px;font-size:12px;color:#94a3b8">Email</p>
      <p style="margin:0;color:#60a5fa;font-family:monospace">{applicant_email}</p>
    </div>
    <a href="{approve_url}" style="display:inline-block;background:linear-gradient(135deg,#1e40af,#6d28d9);color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px">
      Review in Admin Panel →
    </a>
  </div>
  <div style="padding:12px 24px;border-top:1px solid #334155;font-size:11px;color:#64748b">ObserveML · Admin Notification</div>
</div></body></html>"""
    return _send_simple(admin_email, "New Registration Request — ObserveML", html,
                        f"New registration: {applicant_name} ({applicant_email}). Review at: {approve_url}")


def send_approval_email(to_email: str, to_name: str) -> bool:
    """Notify user their account has been approved."""
    login_url = "http://localhost:5173/login"
    html = f"""
<html><body style="font-family:sans-serif;background:#0f172a;color:#e2e8f0;padding:24px">
<div style="max-width:560px;margin:0 auto;background:#1e293b;border:1px solid #334155;border-radius:12px;overflow:hidden">
  <div style="padding:16px 24px;background:linear-gradient(135deg,#065f46,#047857);border-bottom:1px solid #334155">
    <span style="font-size:16px;font-weight:700;color:#fff">✅ Account Approved!</span>
  </div>
  <div style="padding:24px">
    <p style="color:#cbd5e1;margin:0 0 16px">Hi <strong>{to_name}</strong>, your ObserveML account has been approved by the administrator.</p>
    <a href="{login_url}" style="display:inline-block;background:linear-gradient(135deg,#065f46,#047857);color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px">
      🔐 Log In Now
    </a>
  </div>
  <div style="padding:12px 24px;border-top:1px solid #334155;font-size:11px;color:#64748b">ObserveML Platform</div>
</div></body></html>"""
    return _send_simple(to_email, "Your ObserveML account has been approved ✅", html,
                        f"Hi {to_name}, your ObserveML account is approved. Log in at: {login_url}")


def send_rejection_email(to_email: str, to_name: str, reason: str = "") -> bool:
    """Notify user their account request was rejected."""
    html = f"""
<html><body style="font-family:sans-serif;background:#0f172a;color:#e2e8f0;padding:24px">
<div style="max-width:560px;margin:0 auto;background:#1e293b;border:1px solid #334155;border-radius:12px;overflow:hidden">
  <div style="padding:16px 24px;background:linear-gradient(135deg,#7f1d1d,#b91c1c);border-bottom:1px solid #334155">
    <span style="font-size:16px;font-weight:700;color:#fff">❌ Registration Not Approved</span>
  </div>
  <div style="padding:24px">
    <p style="color:#cbd5e1;margin:0 0 12px">Hi <strong>{to_name}</strong>, your ObserveML registration request was not approved.</p>
    {f'<p style="color:#94a3b8;font-size:13px;margin:0">Reason: {reason}</p>' if reason else ''}
    <p style="color:#64748b;font-size:12px;margin:16px 0 0">If you believe this was a mistake, please contact your administrator.</p>
  </div>
  <div style="padding:12px 24px;border-top:1px solid #334155;font-size:11px;color:#64748b">ObserveML Platform</div>
</div></body></html>"""
    return _send_simple(to_email, "ObserveML — Registration Not Approved", html,
                        f"Hi {to_name}, your registration request was not approved. {reason}")
