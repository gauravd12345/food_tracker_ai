# Smart Chef

Snap ingredient photos, confirm what they are, build a pantry, and get LLM recipe suggestions.

## Layout

```
food_tracker_ai/
├── inference/          # CNN architecture + prediction helpers
├── models/             # grocery_cnn.pth weights
├── server/             # FastAPI app + Smart Chef website
│   ├── app.py
│   ├── pantry.py
│   ├── recipes.py
│   └── static/
├── training/           # notebook used to train the CNN
└── requirements.txt
```

## Setup

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
# put your Gemini API key in .env as GEMINI_API_KEY=...
```

## Run the website

```bash
uvicorn server.app:app --reload --host 0.0.0.0 --port 8000
```

Open [http://localhost:8000](http://localhost:8000).

1. Upload an ingredient photo  
2. Confirm / edit the label  
3. Repeat to fill **Your pantry**  
4. Click **Suggest recipes** (uses Gemini)

## API

- `GET /api/health` — service status  
- `GET /api/classes` — grocery labels the CNN knows  
- `POST /api/predict` — classify an image (`file` multipart field)  
- `POST /api/confirm` — confirm a label and optionally add it to the pantry  
- `GET /api/pantry` — current pantry items  
- `POST /api/pantry/items` — add an ingredient  
- `DELETE /api/pantry/items/{id}` — remove one item  
- `DELETE /api/pantry` — clear pantry  
- `POST /api/recipes` — `{ "ingredients": ["pasta", "tomato sauce"] }` → recipe ideas via Gemini  

## Training

The original training notebook lives in `training/main.ipynb`. Weights are saved to `models/grocery_cnn.pth`.
