from fastapi import FastAPI
from backend.app.api.routes import router

app = FastAPI(title="Solar Tracker Simulator")

app.include_router(router)


@app.get("/")
def home():
    return {"message": "Solar Tracker Simulator API running"}