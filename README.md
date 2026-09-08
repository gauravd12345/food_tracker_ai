# Smart Chef

Upload a grocery photo and a CNN trained on the Freiburg Groceries dataset classifies it into one of 25 kitchen staples.

## Layout

```
food_tracker_ai/
├── inference/          # model architecture + prediction helpers
├── models/             # grocery_cnn.pth weights
├── server/             # FastAPI app + Smart Chef website
│   └── static/
├── training/           # notebook used to train the CNN
└── requirements.txt
```

## Setup

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

## Run the website

```bash
uvicorn server.app:app --reload --host 0.0.0.0 --port 8000
```

Open [http://localhost:8000](http://localhost:8000), upload an image, and view the top predictions.

## API

- `GET /api/health` — service status
- `GET /api/classes` — list of grocery labels
- `POST /api/predict` — multipart form field `file` with an image

## Training

The original training notebook lives in `training/main.ipynb`. Weights are saved to `models/grocery_cnn.pth`.
