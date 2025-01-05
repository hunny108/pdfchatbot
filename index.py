import os
import PyPDF2
import numpy as np
import psycopg2
import requests
from flask import Flask, request, jsonify,render_template
from sentence_transformers import SentenceTransformer
from transformers import GPT2LMHeadModel, GPT2Tokenizer

app = Flask(__name__)

# Load models
embedding_model = SentenceTransformer('all-MiniLM-L6-v2')
gpt2_model = GPT2LMHeadModel.from_pretrained('gpt2')
gpt2_tokenizer = GPT2Tokenizer.from_pretrained('gpt2')

# PostgreSQL connection
conn = psycopg2.connect(
    dbname='pdfchatbot_ggoi',
    user='pdfchatbot_ggoi_user',
    password='ZPvlAydCwERkcxR98TcnrUzilBK9C6Sp',
    host='dpg-ctt396lds78s73cjvcig-a.oregon-postgres.render.com',
    port='5432'
)
cursor = conn.cursor()

# Gemini API details
GEMINI_API_KEY = 'AIzaSyCUc1wsSeTqFzH1xOnUQbBot8Tn8QX2qtI'  # Use your actual API key here
GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=AIzaSyCUc1wsSeTqFzH1xOnUQbBot8Tn8QX2qtI'

def parse_pdf(file):
    """Extract text from a PDF file."""
    reader = PyPDF2.PdfReader(file)
    pdf_text = ""
    for page in reader.pages:
        pdf_text += page.extract_text() + "\n"
    return pdf_text

def create_vector_store(text):
    """Split text into sentences, generate embeddings, and save to DB."""
    sentences = text.split('. ')
    for sentence in sentences:
        if sentence.strip():  # Avoid empty sentences
            embedding = embedding_model.encode([sentence])[0]
            save_vector_to_db(sentence, embedding)

def save_vector_to_db(sentence, vector):
    """Save sentence and its vector to the database."""
    try:
        cursor.execute(
            "INSERT INTO documents (content, embedding) VALUES (%s, %s)",
            (sentence, vector.tolist())  # Convert numpy array to list
        )
        conn.commit()
    except Exception as e:
        conn.rollback()  # Roll back in case of an error
        raise Exception(f"Failed to save to database: {str(e)}")

def find_top_n_similar(query, n=5):
    """Find top N most similar sentences to the query."""
    query_embedding = embedding_model.encode([query])[0]
    query_vector = np.array(query_embedding).tolist()

    query_vector_str = str(query_vector)

    query_str = f"SELECT content, embedding <=> '{query_vector_str}'::vector AS similarity FROM documents ORDER BY similarity LIMIT %s"
    cursor.execute(query_str, (n,))
    rows = cursor.fetchall()

    return rows

def generate_answer_with_context(question, context):
    print(question, context)
    """Generate a response using Gemini API, combining the question with the most similar context."""
    
    # Extract top similar content from the query result (context)
    if context:
        context = " ".join([item[0] for item in context])  # Join the content of top n results
    else:
        context = "No relevant context found."
    
    combined_prompt = f"Question: {question}\nContext: {context}\nAnswer:"

    data = {
        "contents": [
            {
                "parts": [
                    {
                        "text": combined_prompt
                    }
                ]
            }
        ]
    }

    # Send the POST request to the Gemini API
    response = requests.post(GEMINI_API_URL, json=data)
    
    if response.status_code == 200:
        try:
            # Parse the JSON response
            response_json = response.json()
            # Extract the generated text
            generated_text = response_json.get('candidates', [{}])[0].get('content', {}).get('parts', [{}])[0].get('text', '')
            return generated_text
        except Exception as e:
            return f"Error parsing response: {e}"
    else:
        return f"Error: {response.status_code} - {response.text}"

@app.route('/upload', methods=['POST'])
def upload_pdf():
    """Upload and process a PDF."""
    if 'file' not in request.files:
        return jsonify({"error": "No file part"}), 400

    file = request.files['file']
    if file.filename == '':
        return jsonify({"error": "No selected file"}), 400

    if not file.filename.lower().endswith('.pdf'):
        return jsonify({"error": "Only PDF files are allowed"}), 400

    try:
        # Parse the PDF
        pdf_text = parse_pdf(file)
        if not pdf_text.strip():
            return jsonify({"error": "The uploaded PDF contains no readable text"}), 400

        # Create vector store and add to database
        create_vector_store(pdf_text)
        return jsonify({"message": "PDF uploaded and processed successfully!"}), 200

    except Exception as e:
        # Log and return an error if anything goes wrong
        return jsonify({"error": f"An error occurred: {str(e)}"}), 500
    
@app.route('/')
def index():
    return render_template('index.html')

@app.route('/upload/status', methods=['GET'])
def upload_status():
    """Check the status of uploads in the database."""
    try:
        cursor.execute("SELECT COUNT(*) FROM documents")
        row_count = cursor.fetchone()[0]
        return jsonify({"message": f"Total entries in the database: {row_count}"}), 200
    except Exception as e:
        return jsonify({"error": f"An error occurred: {str(e)}"}), 500

@app.route('/ask', methods=['POST'])
def ask_question():
    """Answer a question based on uploaded PDFs, sending both question and similar data to Gemini."""
    data = request.json
    question = data.get('question')
    if not question:
        return jsonify({"error": "No question provided"}), 400

    try:
        # Find the most similar sentences from the database based on the question
        most_similar_text = find_top_n_similar(question)
        
        # Generate the answer by combining the question and context
        answer = generate_answer_with_context(question, most_similar_text)
        
        return jsonify({"answer": answer}), 200
    except Exception as e:
        return jsonify({"error": f"An error occurred: {str(e)}"}), 500

if __name__ == '__main__':
    app.run(debug=True)

# Close the database connection when the app is stopped
import atexit
atexit.register(lambda: conn.close())
