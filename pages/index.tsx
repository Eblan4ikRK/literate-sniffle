// pages/index.tsx
import { useEffect, useState } from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler,
} from 'chart.js';
import { Line } from 'react-chartjs-2';

// Регистрируем нужные компоненты Chart.js
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

// Интерфейс статистики
interface Stats {
  total: number;
  rps: number;
  timestamp: number;
}

export default function Home() {
  const [stats, setStats] = useState<Stats>({
    total: 0,
    rps: 0,
    timestamp: Date.now(),
  });
  const [history, setHistory] = useState<{ time: string; rps: number }[]>([]);

  useEffect(() => {
    const eventSource = new EventSource('/api/stats-stream');

    eventSource.onmessage = (event) => {
      try {
        const data: Stats = JSON.parse(event.data);
        setStats(data);

        // Добавляем в историю (ограничиваем 20 точками)
        setHistory((prev) => {
          const newHistory = [...prev, { time: new Date().toLocaleTimeString(), rps: data.rps }];
          return newHistory.slice(-20); // последние 20 значений
        });
      } catch (e) {
        console.error('Parse error:', e);
      }
    };

    eventSource.onerror = () => {
      console.error('SSE connection error');
      eventSource.close();
    };

    return () => {
      eventSource.close();
    };
  }, []);

  const makeRequest = async () => {
    try {
      await fetch('/api/request-logger', { method: 'POST' });
    } catch (err) {
      console.warn('Request failed:', err);
    }
  };

  // Данные для графика
  const chartData = {
    labels: history.map((h) => h.time),
    datasets: [
      {
        label: 'RPS (запросов в секунду)',
        data: history.map((h) => h.rps),
        borderColor: '#1976d2',
        backgroundColor: 'rgba(25, 118, 210, 0.1)',
        fill: true,
        tension: 0.4,
        pointRadius: 3,
      },
    ],
  };

  const chartOptions = {
    responsive: true,
    plugins: {
      legend: { position: 'top' as const },
      tooltip: {
        callbacks: {
          label: (context: any) => `${context.parsed.y} RPS`,
        },
      },
    },
    scales: {
      y: {
        beginAtZero: true,
        ticks: {
          stepSize: 1,
        },
      },
    },
  };

  return (
    <div style={{ fontFamily: 'system-ui, sans-serif', maxWidth: '1000px', margin: '0 auto', padding: '2rem' }}>
      <h1 style={{ textAlign: 'center', marginBottom: '2rem' }}>📊 Live Request Monitor</h1>

      {/* Статистика */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '2rem' }}>
        <div style={statsCardStyle}>
          <div style={statLabelStyle}>Всего запросов</div>
          <div style={statValueStyle}>{stats.total}</div>
        </div>
        <div style={statsCardStyle}>
          <div style={statLabelStyle}>RPS</div>
          <div style={{
            ...statValueStyle,
            color: stats.rps > 10 ? '#d32f2f' : stats.rps > 5 ? '#ed6c02' : '#2e7d32'
          }}>
            {stats.rps}
          </div>
        </div>
      </div>

      {/* График */}
      <div style={{ marginBottom: '2rem', padding: '1rem', backgroundColor: 'white', borderRadius: '8px', border: '1px solid #e0e0e0' }}>
        <Line data={chartData} options={chartOptions} />
      </div>

      {/* Кнопки */}
      <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
        <button onClick={makeRequest} style={buttonStyle}>
          🔘 1 запрос
        </button>
        <button
          onClick={() => {
            for (let i = 0; i < 50; i++) {
              setTimeout(makeRequest, i * 50); // 50 запросов за 2.5 сек
            }
          }}
          style={{ ...buttonStyle, backgroundColor: '#d32f2f' }}
        >
          🚀 50 запросов
        </button>
      </div>

      {/* Статус */}
      <div style={{
        textAlign: 'center',
        padding: '1rem',
        backgroundColor: '#e8f5e9',
        borderRadius: '8px',
        fontSize: '0.9rem'
      }}>
        Подключение: ✅ Live (через SSE)
      </div>
    </div>
  );
}

// Стили (оставь как были)
const statsCardStyle = { /* ... */ };
const statLabelStyle = { /* ... */ };
const statValueStyle = { /* ... */ };
const buttonStyle = { /* ... */ };