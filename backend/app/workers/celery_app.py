from celery import Celery
from app.core.config import settings

celery_app = Celery(
    "arche_gtm",
    broker=settings.CELERY_BROKER_URL,
    backend=settings.CELERY_RESULT_BACKEND,
    include=["app.workers.tasks"],
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    task_track_started=True,
    task_acks_late=True,
    worker_prefetch_multiplier=1,
    beat_schedule={
        # Check campaign enrollment daily
        "check-campaign-enrollments": {
            "task": "app.workers.tasks.process_campaign_enrollments",
            "schedule": 86400,  # every 24 hours
        },
    },
)
