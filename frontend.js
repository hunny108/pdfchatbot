import React, { useState, useEffect } from 'react';
import { Send, Upload, FileText, Loader } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';

const ChatbotUI = () => {
  const [messages, setMessages] = useState([]);
  const [inputMessage, setInputMessage] = useState('');
  const [selectedFile, setSelectedFile] = useState(null);
  const [isFileUploaded, setIsFileUploaded] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState('');
  
  // Check upload status periodically
  useEffect(() => {
    if (isFileUploaded) {
      const checkStatus = async () => {
        try {
          const response = await fetch('/upload/status');
          const data = await response.json();
          setUploadStatus(data.message);
        } catch (error) {
          console.error('Error checking status:', error);
        }
      };

      const interval = setInterval(checkStatus, 5000);
      return () => clearInterval(interval);
    }
  }, [isFileUploaded]);

  const handleFileUpload = async (file) => {
    if (file && file.type === 'application/pdf') {
      setIsLoading(true);
      const formData = new FormData();
      formData.append('file', file);

      try {
        const response = await fetch('/upload', {
          method: 'POST',
          body: formData,
        });

        const data = await response.json();

        if (response.ok) {
          setSelectedFile(file);
          setIsFileUploaded(true);
          setMessages(prev => [...prev, {
            type: 'system',
            content: `PDF "${file.name}" successfully uploaded. You can now ask questions about it!`,
            timestamp: new Date().toLocaleTimeString()
          }]);
        } else {
          setMessages(prev => [...prev, {
            type: 'system',
            content: `Error: ${data.error}`,
            timestamp: new Date().toLocaleTimeString()
          }]);
        }
      } catch (error) {
        setMessages(prev => [...prev, {
          type: 'system',
          content: `Error uploading file: ${error.message}`,
          timestamp: new Date().toLocaleTimeString()
        }]);
      } finally {
        setIsLoading(false);
      }
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (inputMessage.trim() && isFileUploaded) {
      const userMessage = {
        type: 'user',
        content: inputMessage,
        timestamp: new Date().toLocaleTimeString()
      };
      setMessages(prev => [...prev, userMessage]);
      setInputMessage('');
      setIsLoading(true);

      try {
        const response = await fetch('/ask', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ question: inputMessage }),
        });

        const data = await response.json();

        if (response.ok) {
          setMessages(prev => [...prev, {
            type: 'bot',
            content: data.answer,
            timestamp: new Date().toLocaleTimeString()
          }]);
        } else {
          setMessages(prev => [...prev, {
            type: 'system',
            content: `Error: ${data.error}`,
            timestamp: new Date().toLocaleTimeString()
          }]);
        }
      } catch (error) {
        setMessages(prev => [...prev, {
          type: 'system',
          content: `Error: ${error.message}`,
          timestamp: new Date().toLocaleTimeString()
        }]);
      } finally {
        setIsLoading(false);
      }
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-100 via-purple-50 to-pink-100 p-6">
      <Card className="w-full max-w-3xl mx-auto h-[700px] flex flex-col bg-white/80 backdrop-blur-lg border-0 shadow-xl">
        <CardHeader className="border-b bg-gradient-to-r from-indigo-500 to-purple-500 text-white rounded-t-lg">
          <CardTitle className="text-2xl font-bold">PDF Chatbot</CardTitle>
          {uploadStatus && (
            <p className="text-sm opacity-80">{uploadStatus}</p>
          )}
        </CardHeader>
        
        <CardContent className="flex-1 flex flex-col space-y-4 overflow-hidden p-6">
          {!isFileUploaded ? (
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setIsDragging(false);
                const file = e.dataTransfer.files[0];
                if (file) handleFileUpload(file);
              }}
              className={`flex flex-col items-center justify-center space-y-6 p-12 border-2 border-dashed rounded-xl transition-all duration-300 ${
                isDragging 
                  ? 'border-purple-500 bg-purple-50' 
                  : 'border-gray-300 hover:border-purple-400 hover:bg-gray-50'
              }`}
            >
              <div className="bg-gradient-to-br from-indigo-500 to-purple-500 p-4 rounded-full">
                {isLoading ? (
                  <Loader className="w-12 h-12 text-white animate-spin" />
                ) : (
                  <Upload className="w-12 h-12 text-white" />
                )}
              </div>
              <div className="text-center">
                <h3 className="text-xl font-semibold mb-2">Drop your PDF here</h3>
                <p className="text-gray-500 mb-4">or</p>
                <label className="cursor-pointer inline-flex items-center px-6 py-3 rounded-full bg-gradient-to-r from-indigo-500 to-purple-500 text-white hover:from-indigo-600 hover:to-purple-600 transition-all duration-300">
                  <FileText className="w-5 h-5 mr-2" />
                  Choose File
                  <input
                    type="file"
                    accept=".pdf"
                    onChange={(e) => handleFileUpload(e.target.files[0])}
                    className="hidden"
                    disabled={isLoading}
                  />
                </label>
              </div>
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto space-y-4 pr-4">
              {messages.map((message, index) => (
                <div
                  key={index}
                  className={`flex ${message.type === 'user' ? 'justify-end' : 'justify-start'} animate-fade-in`}
                >
                  {message.type === 'system' ? (
                    <Alert className="bg-gradient-to-r from-indigo-50 to-purple-50 border-l-4 border-purple-500">
                      <AlertDescription>{message.content}</AlertDescription>
                    </Alert>
                  ) : (
                    <div className="flex flex-col">
                      <div
                        className={`max-w-[80%] rounded-2xl p-4 ${
                          message.type === 'user'
                            ? 'bg-gradient-to-r from-indigo-500 to-purple-500 text-white ml-auto'
                            : 'bg-gray-100'
                        }`}
                      >
                        {message.content}
                      </div>
                      <span className="text-xs text-gray-400 mt-1 mx-2">
                        {message.timestamp}
                      </span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          <form onSubmit={handleSubmit} className="flex items-center space-x-3 bg-white p-3 rounded-lg shadow-sm">
            <input
              type="text"
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              placeholder={isFileUploaded ? "Ask a question about the PDF..." : "Upload a PDF first"}
              disabled={!isFileUploaded || isLoading}
              className="flex-1 p-3 rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-purple-500 transition-all duration-300"
            />
            <button
              type="submit"
              disabled={!isFileUploaded || isLoading}
              className="p-3 rounded-lg bg-gradient-to-r from-indigo-500 to-purple-500 text-white hover:from-indigo-600 hover:to-purple-600 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? (
                <Loader className="w-5 h-5 animate-spin" />
              ) : (
                <Send className="w-5 h-5" />
              )}
            </button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};

export default ChatbotUI;