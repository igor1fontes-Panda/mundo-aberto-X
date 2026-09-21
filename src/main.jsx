import { createRoot } from 'react-dom/client';
import { injectSpeedInsights } from '@vercel/speed-insights';
import App from './App.jsx';

createRoot(document.getElementById('root')).render(<App />);
injectSpeedInsights();
