# mcf-ads-engine/dashboard/server.py
import json
import os
import subprocess
from datetime import datetime
from pathlib import Path
from typing import Literal

from fastapi import FastAPI, HTTPException
from fastapi.responses import HTMLResponse, PlainTextResponse
from fastapi.templating import Jinja2Templates
from fastapi.requests import Request
from pydantic import BaseModel

from generator.landing import generate_landing, load_existing_slugs, append_landing_to_file
from generator.campaign import generate_campaign_draft
from analyzer.negatives import export_to_gade_csv
from writer.google_ads import pause_keyword, add_negative_keyword, update_campaign_budget, update_keyword_bid
from analyzer.campaign_audit import run_audit

app = FastAPI(title="MCF Ads Engine Dashboard")
templates = Jinja2Templates(directory=Path(__file__).parent / "templates")


def get_proposals_dir() -> Path:
    return Path(os.environ.get("PROPOSALS_DIR", "data/proposals"))


def get_landing_pages_path() -> str:
    return os.environ.get("LANDING_PAGES_PATH", "../mediocreditofacile/src/data/landing-pages.json")


def get_negatives_dir() -> Path:
    return Path(os.environ.get("NEGATIVES_DIR", "data/negatives"))


def load_negatives(date_str: str) -> dict:
    path = get_negatives_dir() / f"{date_str}.json"
    if not path.exists():
        raise HTTPException(status_code=404, detail=f"No negatives for {date_str}")
    with open(path) as f:
        return json.load(f)


def save_negatives(negatives: dict, date_str: str) -> None:
    path = get_negatives_dir() / f"{date_str}.json"
    with open(path, "w") as f:
        json.dump(negatives, f, ensure_ascii=False, indent=2)


def latest_negatives_date() -> str:
    neg_dir = get_negatives_dir()
    files = sorted(neg_dir.glob("*.json"), reverse=True)
    if not files:
        raise HTTPException(status_code=404, detail="No negatives found")
    return files[0].stem


def load_proposals(date_str: str) -> dict:
    path = get_proposals_dir() / f"{date_str}.json"
    if not path.exists():
        raise HTTPException(status_code=404, detail=f"No proposals for {date_str}")
    with open(path) as f:
        return json.load(f)


def save_proposals(proposals: dict, date_str: str) -> None:
    path = get_proposals_dir() / f"{date_str}.json"
    with open(path, "w") as f:
        json.dump(proposals, f, ensure_ascii=False, indent=2)


def latest_date() -> str:
    proposals_dir = get_proposals_dir()
    files = sorted(proposals_dir.glob("*.json"), reverse=True)
    if not files:
        raise HTTPException(status_code=404, detail="No proposals found")
    return files[0].stem


# --- Routes ---

@app.get("/", response_class=HTMLResponse)
async def dashboard(request: Request):
    return templates.TemplateResponse("index.html", {"request": request})


@app.get("/api/proposals/latest")
async def get_latest_proposals():
    date_str = latest_date()
    return load_proposals(date_str)


class ApproveAction(BaseModel):
    date: str
    list: Literal["to_pause", "to_reward", "to_review", "landing_proposals", "campaign_drafts"]
    index: int
    action: Literal["approved", "rejected"]


def _get_customer_id() -> str:
    return os.environ.get("GOOGLE_ADS_CUSTOMER_ID", "5572178058")


@app.post("/api/actions/approve")
async def approve_action(body: ApproveAction):
    proposals = load_proposals(body.date)
    lst = proposals.get(body.list, [])
    if body.index >= len(lst):
        raise HTTPException(status_code=400, detail="Invalid index")
    item = lst[body.index]
    item["status"] = body.action

    if body.action == "approved":
        customer_id = _get_customer_id()
        if body.list == "to_pause" and item.get("resource_name"):
            try:
                pause_keyword(customer_id, item["resource_name"])
                item["status"] = "applied"
                item["applied_at"] = datetime.utcnow().isoformat()
            except Exception as e:
                item["apply_error"] = str(e)
        elif body.list == "to_reward" and item.get("resource_name"):
            bid = item.get("bid_suggestion")
            if bid:
                try:
                    update_keyword_bid(customer_id, item["resource_name"], float(bid))
                    item["status"] = "applied"
                    item["applied_at"] = datetime.utcnow().isoformat()
                except Exception as e:
                    item["apply_error"] = str(e)

    save_proposals(proposals, body.date)
    return {"ok": True, "status": item["status"]}


class GenerateLandingBody(BaseModel):
    angle: str
    date: str


@app.post("/api/landings/generate")
async def generate_landing_endpoint(body: GenerateLandingBody):
    api_key = os.environ["ANTHROPIC_API_KEY"]
    existing_slugs = load_existing_slugs(get_landing_pages_path())
    landing = generate_landing(body.angle, existing_slugs, api_key)
    proposals = load_proposals(body.date)
    proposals["landing_proposals"].append({
        "source": "manual",
        "trigger_keyword": None,
        "angle_input": body.angle,
        "landing_json": landing,
        "status": "pending",
    })
    save_proposals(proposals, body.date)
    return landing


class ApproveLandingBody(BaseModel):
    date: str
    index: int


@app.post("/api/landings/approve")
async def approve_landing(body: ApproveLandingBody):
    proposals = load_proposals(body.date)
    proposal = proposals["landing_proposals"][body.index]
    landing = proposal["landing_json"]

    # Append to landing-pages.json
    append_landing_to_file(landing, get_landing_pages_path())

    # Git commit
    landing_path = get_landing_pages_path()
    subprocess.run(["git", "add", landing_path], check=True,
                   cwd=str(Path(landing_path).parent.parent.parent))
    subprocess.run(
        ["git", "commit", "-m", f"feat: add landing page {landing['slug']}"],
        check=True, cwd=str(Path(landing_path).parent.parent.parent)
    )

    # Generate campaign draft
    api_key = os.environ["ANTHROPIC_API_KEY"]
    campaign_draft = generate_campaign_draft(
        landing=landing,
        keywords=[],
        campaign_name=f"{landing['heroTitle'][:30]} — Angoli",
        api_key=api_key,
    )
    proposals["campaign_drafts"].append(campaign_draft)
    proposal["status"] = "approved"
    save_proposals(proposals, body.date)

    return {"ok": True, "slug": landing["slug"], "campaign_draft_added": True}


class FeedbackBody(BaseModel):
    date: str
    index: int
    feedback: str


@app.post("/api/review/feedback")
async def save_review_feedback(body: FeedbackBody):
    proposals = load_proposals(body.date)
    proposals["to_review"][body.index]["alberto_feedback"] = body.feedback
    proposals["to_review"][body.index]["status"] = "reviewed"
    save_proposals(proposals, body.date)
    return {"ok": True}


# --- Negatives routes ---

@app.get("/api/negatives/latest")
async def get_latest_negatives():
    date_str = latest_negatives_date()
    return load_negatives(date_str)


class ApproveNegativeBody(BaseModel):
    date: str
    index: int
    action: Literal["approved", "rejected"]


@app.post("/api/negatives/approve")
async def approve_negative(body: ApproveNegativeBody):
    data = load_negatives(body.date)
    lst = data.get("negatives", [])
    if body.index >= len(lst):
        raise HTTPException(status_code=400, detail="Invalid index")
    item = lst[body.index]
    item["status"] = body.action

    if body.action == "approved" and item.get("ad_group_resource_name"):
        customer_id = _get_customer_id()
        try:
            add_negative_keyword(
                customer_id,
                item["ad_group_resource_name"],
                item["search_term"],
                item.get("match_type", "PHRASE"),
            )
            item["status"] = "applied"
            item["applied_at"] = datetime.utcnow().isoformat()
        except Exception as e:
            item["apply_error"] = str(e)

    save_negatives(data, body.date)
    return {"ok": True, "status": item["status"]}


class BudgetUpdateBody(BaseModel):
    campaign_budget_resource_name: str
    new_daily_budget_euros: float


@app.post("/api/budget/update")
async def budget_update(body: BudgetUpdateBody):
    customer_id = _get_customer_id()
    result = update_campaign_budget(
        customer_id,
        body.campaign_budget_resource_name,
        body.new_daily_budget_euros,
    )
    return {"ok": True, "result": result}


def get_audits_dir() -> Path:
    return Path(os.environ.get("AUDITS_DIR", "data/audits"))


def latest_audit_date() -> str:
    audits_dir = get_audits_dir()
    files = sorted(audits_dir.glob("*.json"), reverse=True)
    if not files:
        return ""
    return files[0].stem


@app.get("/audit", response_class=HTMLResponse)
async def audit_page(request: Request):
    return templates.TemplateResponse("audit.html", {"request": request})


@app.get("/api/audit/latest")
async def get_latest_audit():
    date_str = latest_audit_date()
    if not date_str:
        raise HTTPException(status_code=404, detail="No audit found. Run python main.py --weekly")
    path = get_audits_dir() / f"{date_str}.json"
    with open(path) as f:
        return json.load(f)


@app.post("/api/audit/refresh")
async def refresh_audit():
    """Esegue un nuovo audit live (può richiedere ~10 sec)."""
    customer_id = _get_customer_id()
    try:
        audit_data = run_audit(customer_id)
        from datetime import date
        today = date.today().isoformat()
        audit_data["date"] = today
        audits_dir = get_audits_dir()
        audits_dir.mkdir(parents=True, exist_ok=True)
        with open(audits_dir / f"{today}.json", "w") as f:
            json.dump(audit_data, f, ensure_ascii=False, indent=2)
        return audit_data
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


class ExportNegativesBody(BaseModel):
    date: str


@app.post("/api/negatives/export")
async def export_negatives(body: ExportNegativesBody):
    data = load_negatives(body.date)
    csv_content = export_to_gade_csv(data.get("negatives", []))
    return PlainTextResponse(
        content=csv_content,
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename=negatives-{body.date}.csv"},
    )
