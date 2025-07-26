# Google Drive Agent

A Next.js application that connects to Google Drive, ingests documents, and provides an AI-powered chat interface to query document contents using RAG (Retrieval Augmented Generation).

## 🚀 Features

- **Google Drive Integration**: Automatically ingests documents from Google Drive using Service Account authentication
- **Multi-format Support**: Handles PDF, DOCX, XLSX, TXT, and CSV files
- **AI-Powered Chat**: Uses Google Generative AI for document Q&A with context awareness
- **Session-based Processing**: Maintains separate document contexts per session
- **Real-time Updates**: Live ingestion status and progress tracking
- **Responsive UI**: Modern interface built with Next.js 14, Tailwind CSS, and shadcn/ui

## 🛠 Tech Stack

- **Frontend**: Next.js 14, React, TypeScript
- **Styling**: Tailwind CSS, shadcn/ui components
- **AI/ML**: LangChain, Google Generative AI
- **Document Processing**: PDF.js, Mammoth.js, XLSX
- **Authentication**: Google Service Account
- **Vector Storage**: In-memory vector store with embeddings

## 📋 Prerequisites

- Node.js 18+ 
- Google Cloud Project with Drive API enabled
- Google Service Account with Google Drive access
- Google Generative AI API key

## 🔧 Setup Instructions

### 1. Clone the Repository

```bash
git clone https://github.com/patabrava/gdriveagent.git
cd gdriveagent
```

### 2. Install Dependencies

```bash
cd nextjstemplate
npm install
```

### 3. Configure Environment Variables

Create a `.env.local` file in the `nextjstemplate` directory:

```env
# Google Generative AI
GOOGLE_GENERATIVE_AI_API_KEY=your_api_key_here

# Google Service Account (JSON file path)
GOOGLE_SERVICE_ACCOUNT_PATH=../path_to_your_service_account.json

# Optional: Specific folder ID to ingest from
GOOGLE_DRIVE_FOLDER_ID=your_folder_id_here
```

### 4. Google Cloud Setup

1. Create a Google Cloud Project
2. Enable the Google Drive API
3. Create a Service Account
4. Download the service account JSON key
5. Share your Google Drive folder with the service account email
6. Place the JSON file in a secure location (it's automatically ignored by .gitignore)

### 5. Run the Application

```bash
npm run dev
```

Visit `http://localhost:3000` to start using the application.

## 🔒 Security Features

- Comprehensive `.gitignore` to prevent committing sensitive files
- Service account JSON files are automatically excluded
- Environment variables for all sensitive configuration
- Secure file processing with proper error handling

## 📁 Project Structure

```
nextjstemplate/
├── app/
│   ├── api/
│   │   ├── chat/          # Chat API endpoint
│   │   └── ingest/        # Document ingestion API
│   ├── page.tsx           # Main application page
│   └── layout.tsx         # Root layout
├── components/
│   ├── chat.tsx           # Chat interface component
│   └── ui/                # shadcn/ui components
├── lib/
│   └── utils.ts           # Utility functions
└── public/                # Static assets
```

## 🚀 Usage

1. **Start the Application**: Open the app in your browser
2. **Document Ingestion**: The app automatically starts ingesting documents from your Google Drive
3. **Monitor Progress**: Watch the real-time ingestion status
4. **Chat with Documents**: Once ingestion is complete, ask questions about your documents
5. **Get AI Responses**: Receive contextual answers based on your document content

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Follow the MONOCODE principles for implementation
5. Submit a pull request

## 📄 License

This project is licensed under the MIT License.

## 🔗 Links

- [Repository](https://github.com/patabrava/gdriveagent)
- [Issues](https://github.com/patabrava/gdriveagent/issues)
- [Google Drive API Documentation](https://developers.google.com/drive/api)
- [LangChain Documentation](https://langchain.readthedocs.io/)
