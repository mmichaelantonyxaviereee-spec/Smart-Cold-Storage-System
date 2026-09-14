from flask import Flask, request, jsonify, send_from_directory
from PIL import Image
import requests
import io
import time
import os

app = Flask(__name__, static_folder="../", static_url_path="")

ESP32_URL = "http://10.174.205.197"

MODEL_PATH = "runs/classify/tomato_classification/weights/best.pt"

model = None


def get_model():
    global model
    if model is None:
        from ultralytics import YOLO
        model = YOLO(MODEL_PATH)
    return model

latest_ai = {
    "class": "WAITING",
    "confidence": 0.0,
    "decision": "WAITING",
    "timestamp": "Not yet"
}


@app.route("/")
def home():
    return send_from_directory(
        "../",
        "index.html"
    )


@app.route("/styles.css")
def styles():
    return send_from_directory(
        "../",
        "styles.css"
    )


@app.route("/app.js")
def javascript():
    return send_from_directory(
        "../",
        "app.js"
    )


@app.route("/api/ai")
def ai_data():
    return jsonify(latest_ai)


@app.route(
    "/predict",
    methods=["POST"]
)
def predict():

    if "image" not in request.files:
        return jsonify({
            "error": "No image received"
        }), 400


    file = request.files["image"]


    image_bytes = file.read()


    try:

        image = Image.open(io.BytesIO(image_bytes)).convert("RGB")


        results = get_model()(image)


        result = results[0]


        class_id = result.probs.top1


        confidence = float(result.probs.top1conf)


        class_name = result.names[class_id]


        confidence_percent = confidence * 100


        if confidence_percent >= 90:

            if (
                class_name.lower()
                == "good"
            ):
                decision = "GOOD"

            else:
                decision = "REJECT"


        elif confidence_percent >= 70:

            decision = "MANUAL_CHECK"


        else:

            decision = "UNCERTAIN"


        latest_ai["class"] = class_name

        latest_ai["confidence"] = round(confidence_percent, 2)

        latest_ai["decision"] = decision

        latest_ai["timestamp"] = time.strftime("%Y-%m-%d %H:%M:%S")


        try:

            requests.get(
                ESP32_URL +
                "/ai",
                params={
                    "status": decision,
                    "confidence":
                        confidence_percent
                },
                timeout=3
            )

        except Exception:

            pass


        return jsonify({
            "class":
                class_name,
            "confidence":
                round(
                    confidence_percent,
                    2
                ),
            "decision":
                decision,
            "timestamp":
                latest_ai[
                    "timestamp"
                ]
        })


    except Exception as error:

        return jsonify({
            "error":
                str(error)
        }), 500


if __name__ == "__main__":

    app.run(
        host="0.0.0.0",
        port=5000,
        debug=False
    )