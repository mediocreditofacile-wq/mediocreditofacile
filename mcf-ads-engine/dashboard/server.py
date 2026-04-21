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


# --- Recommendations (budget advisor) -----------------------------------------

def get_recommendations_dir() -> Path:
    return Path(os.environ.get("RECOMMENDATIONS_DIR", "data/recommendations"))


def load_recommendations(date_str: str) -> dict:
    path = get_recommendations_dir() / f"{date_str}.json"
    if not path.exists():
        raise HTTPException(
            status_code=404,
            detail=f"No recommendations for {date_str}",
        )
    with open(path) as f:
        return json.load(f)


def save_recommendations(data: dict, date_str: str) -> None:
    path = get_recommendations_dir() / f"{date_str}.json"
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


def latest_recommendations_date() -> str:
    rec_dir = get_recommendations_dir()
    files = sorted(rec_dir.glob("*.json"), reverse=True)
    if not files:
        raise HTTPException(status_code=404, detail="No recommendations found")
    return files[0].stem


@app.get("/api/recommendations/latest")
async def get_latest_recommendations():
    date_str = latest_recommendations_date()
    return load_recommendations(date_str)


class ApproveRecommendationBody(BaseModel):
    date: str
    index: int
    action: Literal["approved", "rejected"]
    # Richiesto per applicare in automatico le raccomandazioni con
    # alert_aggressive=True (aumento aggregato > soglia strategica).
    force_apply: bool = False


@app.post("/api/recommendations/approve")
async def approve_recommendation(body: ApproveRecommendationBody):
    """
    Approva o rifiuta una raccomandazione del budget_advisor.

    Logica di applicazione automatica:
    - budget_increase / budget_increase_then_bid_review: se non aggressiva,
      chiama update_campaign_budget; se aggressiva, richiede force_apply=True
      altrimenti status=approved ma non applicata.
    - bid_increase / bid_decrease: non auto-apply. Richiedono intervento
      manuale perche agiscono su piu keyword e alcune campagne (es. quelle
      con MAXIMIZE_CONVERSIONS) non accettano bid manuali. La dashboard
      segnala requires_manual=True.
    """
    data = load_recommendations(body.date)
    lst = data.get("recommendations", [])
    if body.index >= len(lst):
        raise HTTPException(status_code=400, detail="Invalid index")
    item = lst[body.index]
    item["status"] = body.action

    if body.action == "approved":
        action_type = item.get("action_type", "")
        is_aggressive = bool(item.get("alert_aggressive"))

        if action_type in ("budget_increase", "budget_increase_then_bid_review"):
            if is_aggressive and not body.force_apply:
                item["requires_manual"] = True
                item["note"] = (
                    "Aumento aggressivo — richiede force_apply=True per "
                    "l'applicazione automatica. Decisione strategica."
                )
            else:
                resource = item.get("campaign_budget_resource_name")
                if not resource:
                    item["apply_error"] = (
                        "campaign_budget_resource_name mancante: "
                        "rigenera le raccomandazioni con main.py"
                    )
                else:
                    customer_id = _get_customer_id()
                    try:
                        update_campaign_budget(
                            customer_id,
                            resource,
                            float(item["recommended_budget"]),
                        )
                        item["status"] = "applied_budget"
                        item["applied_at"] = datetime.utcnow().isoformat()
                        if action_type == "budget_increase_then_bid_review":
                            item["note"] = (
                                "Budget applicato. Il bid sull'ad group "
                                "pilastro va rivisto manualmente la prossima "
                                "settimana."
                            )
                    except Exception as e:
                        item["apply_error"] = str(e)
        elif action_type in ("bid_increase", "bid_decrease"):
            item["requires_manual"] = True
            item["note"] = (
                "Richiede aggiornamento manuale dei bid sull'ad group "
                "pilastro (Google Ads Editor o vista keyword). Alcune "
                "campagne non accettano bid manuali (MAXIMIZE_CONVERSIONS)."
            )

    save_recommendations(data, body.date)
    return {
        "ok": True,
        "status": item["status"],
        "note": item.get("note"),
        "requires_manual": item.get("requires_manual", False),
        "apply_error": item.get("apply_error"),
    }
