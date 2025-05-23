import React, { useState, useRef, useEffect } from 'react';
import { Camera, StopCircle } from 'lucide-react';
import { RecordingStatus } from '../types';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

interface RecordingInterfaceProps {
  onStartRecording: () => void;
  onStopRecording: () => void;
  recordingStatus: RecordingStatus;
}

const RecordingInterface: React.FC<RecordingInterfaceProps> = ({
  onStartRecording,
  onStopRecording,
  recordingStatus,
}) => {
  const [timeLeft, setTimeLeft] = useState(30);
  const videoRef = useRef<HTMLVideoElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);
  
  const s3Client = new S3Client({
    region: import.meta.env.VITE_AWS_REGION,
    credentials: {
      accessKeyId: import.meta.env.VITE_AWS_ACCESS_KEY_ID,
      secretAccessKey: import.meta.env.VITE_AWS_SECRET_ACCESS_KEY,
    },
  });

  useEffect(() => {
    if (recordingStatus === 'recording') {
      startCamera();
      startTimer();
    } else {
      stopTimer();
      if (recordingStatus === 'completed') {
        stopCamera();
      }
    }
    
    return () => {
      stopTimer();
      stopCamera();
    };
  }, [recordingStatus]);

  useEffect(() => {
    if (timeLeft === 0 && recordingStatus === 'recording') {
      handleStopRecording();
    }
  }, [timeLeft, recordingStatus]);
  
  const startCamera = async () => {
    try {
      if (videoRef.current) {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        videoRef.current.srcObject = stream;
        
        mediaRecorderRef.current = new MediaRecorder(stream);
        chunksRef.current = [];
        
        mediaRecorderRef.current.ondataavailable = (event) => {
          if (event.data.size > 0) {
            chunksRef.current.push(event.data);
          }
        };
        
        mediaRecorderRef.current.start();
      }
    } catch (error) {
      console.error('Error accessing camera:', error);
    }
  };
  
  const stopCamera = () => {
    if (videoRef.current && videoRef.current.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      const tracks = stream.getTracks();
      tracks.forEach(track => track.stop());
      videoRef.current.srcObject = null;
    }
  };

  const uploadToS3 = async (blob: Blob) => {
    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const fileName = `consent-recording-${timestamp}.webm`;

      const command = new PutObjectCommand({
        Bucket: import.meta.env.VITE_S3_BUCKET_NAME,
        Key: fileName,
        Body: blob.stream(),
        ContentType: 'video/webm',
      });

      await s3Client.send(command);
      console.log('Video uploaded successfully');
    } catch (error) {
      console.error('Error uploading to S3:', error);
    }
  };
  
  const handleStopRecording = async () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
      
      mediaRecorderRef.current.onstop = async () => {
        const blob = new Blob(chunksRef.current, { type: 'video/webm' });
        await uploadToS3(blob);
        onStopRecording();
      };
    }
  };
  
  const startTimer = () => {
    setTimeLeft(30);
    timerRef.current = window.setInterval(() => {
      setTimeLeft(prev => Math.max(0, prev - 1));
    }, 1000);
  };
  
  const stopTimer = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };
  
  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };
  
  return (
    <div className="animate-fadeIn">
      <div className="relative rounded-lg overflow-hidden bg-black aspect-video mb-4">
        {recordingStatus !== 'completed' && (
          <video
            ref={videoRef}
            autoPlay
            muted
            playsInline
            className="w-full h-full object-cover"
          />
        )}
        
        {recordingStatus === 'recording' && (
          <div className="absolute top-2 right-2 bg-red-600 text-white px-2 py-1 rounded-md flex items-center text-sm font-medium">
            <span className="w-2 h-2 bg-white rounded-full mr-2 animate-pulse"></span>
            {formatTime(timeLeft)}
          </div>
        )}
        
        {recordingStatus === 'idle' && (
          <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-50">
            <Camera className="text-white" size={48} />
          </div>
        )}

        {recordingStatus === 'completed' && (
          <div className="absolute inset-0 flex items-center justify-center bg-black">
            <div className="text-white text-center">
              <p className="text-2xl font-medium mb-2">Recording Complete</p>
              <p className="text-sm opacity-80">Thank you for your consent</p>
            </div>
          </div>
        )}
      </div>
      
      {recordingStatus === 'idle' && (
        <button
          onClick={onStartRecording}
          className="w-full py-3 px-4 bg-blue-600 hover:bg-blue-700 text-white rounded-md font-medium flex items-center justify-center transition-colors"
        >
          Start Recording
        </button>
      )}
      
      {recordingStatus === 'recording' && (
        <button
          onClick={handleStopRecording}
          className="w-full py-3 px-4 bg-red-600 hover:bg-red-700 text-white rounded-md font-medium flex items-center justify-center transition-colors"
        >
          <StopCircle className="mr-2" size={20} />
          Stop Recording
        </button>
      )}
    </div>
  );
};

export default RecordingInterface;