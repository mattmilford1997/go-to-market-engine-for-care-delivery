from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.db.database import get_db
from app.models.user import User, UserRole
from app.models.company import Company, CompanyStatus
from app.core.auth import hash_password

router = APIRouter(prefix="/seed", tags=["seed"])


@router.post("/default-user")
async def seed_default_user(db: Session = Depends(get_db)):
    """Create the default admin user with the Novamind Mental Health company.

    Default credentials:
        email: admin@archestudios.com
        password: arche2024!
    """
    # Create or find the Novamind company
    company = db.query(Company).filter(
        Company.website_url.in_([
            "https://novamindmentalhealth.com",
            "https://www.novamindmentalhealth.com",
            "novamindmentalhealth.com",
        ])
    ).first()

    if not company:
        company = Company(
            name="NovaMind Mental Health",
            website_url="https://novamindmentalhealth.com",
            slug="novamind",
            status=CompanyStatus.active,
            is_pilot=True,
            specialty_niche="Mental Health & Psychiatry",
            services=[
                {"name": "Psychiatric Evaluation", "description": "Comprehensive psychiatric assessment", "duration": "60 min", "cost_range": "$200-$400"},
                {"name": "Medication Management", "description": "Ongoing medication monitoring and adjustments", "duration": "30 min", "cost_range": "$150-$250"},
                {"name": "Psychotherapy", "description": "Individual therapy sessions (CBT, DBT, EMDR)", "duration": "50 min", "cost_range": "$150-$300"},
                {"name": "TMS Therapy", "description": "Transcranial Magnetic Stimulation for treatment-resistant depression", "duration": "30 min", "cost_range": "$300-$500"},
                {"name": "Ketamine Therapy", "description": "IV ketamine infusions for depression and anxiety", "duration": "60 min", "cost_range": "$400-$800"},
            ],
            locations=[
                {"name": "NovaMind HQ", "city": "Austin", "state": "TX", "zip": "78701", "phone": "(512) 555-0199"},
            ],
            target_demographics=["Adults 25-65", "Treatment-resistant depression", "Anxiety disorders", "PTSD"],
            differentiators=["Advanced neuromodulation", "Ketamine therapy", "Integrative psychiatry", "Evidence-based protocols"],
            insurance_accepted=["Aetna", "Blue Cross Blue Shield", "Cigna", "UnitedHealthcare", "Medicare"],
            brand_guidelines={
                "colors": {"primary": "#6366f1", "secondary": "#818cf8", "accent": "#c084fc"},
                "tone": "Professional, empathetic, scientifically grounded",
            },
        )
        db.add(company)
        db.commit()
        db.refresh(company)

    # Create default admin user
    admin = db.query(User).filter(User.email == "admin@archestudios.com").first()
    if not admin:
        admin = User(
            email="admin@archestudios.com",
            hashed_password=hash_password("arche2024!"),
            full_name="Arche Admin",
            role=UserRole.admin,
            is_active=True,
            company_id=str(company.id),
        )
        db.add(admin)

    # Create default demo user for Novamind
    demo_user = db.query(User).filter(User.email == "demo@novamindmentalhealth.com").first()
    if not demo_user:
        demo_user = User(
            email="demo@novamindmentalhealth.com",
            hashed_password=hash_password("novamind2024!"),
            full_name="NovaMind Demo User",
            role=UserRole.user,
            is_active=True,
            company_id=str(company.id),
        )
        db.add(demo_user)

    db.commit()

    return {
        "message": "Default users seeded successfully",
        "admin": {"email": "admin@archestudios.com", "password": "arche2024!"},
        "demo_user": {"email": "demo@novamindmentalhealth.com", "password": "novamind2024!"},
        "company_id": str(company.id),
        "company_name": company.name,
    }
