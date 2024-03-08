"""Conduct text classification using DistilBert."""
import torch

from flask import Flask, request, jsonify
from transformers import DistilBertTokenizer
from transformers import DistilBertForSequenceClassification

app = Flask(__name__)

# Load model and tokenizer
MODEL_NAME = "distilbert-base-uncased-finetuned-sst-2-english"
model = DistilBertForSequenceClassification.from_pretrained(MODEL_NAME)
tokenizer = DistilBertTokenizer.from_pretrained(MODEL_NAME)


@app.route("/predict", methods=["POST"])
def predict():
    """Classify the input text's emotion based on the pretrained model.

    :return: The input text and the prediction result, in JSON format.
    """
    if request.method == "POST":
        data = request.get_json()
        text = data.get("text", "")
        inputs = tokenizer(text, return_tensors="pt",
                           truncation=True, padding=True)
        with torch.no_grad():
            logits = model(**inputs).logits
        predicted_class_id = logits.argmax().item()
        res = model.config.id2label[predicted_class_id]
        return jsonify({"text": text, "sentiment": res})


if __name__ == "__main__":
    app.run(debug=False)
