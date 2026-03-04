import { formatTime } from './utils.js';

let speedChart = null;

export function renderSpeedChart(solves, chartCanvas, chartContainer) {
  if (solves.length < 2) {
    chartContainer.style.display = 'none';
    if (speedChart) { speedChart.destroy(); speedChart = null; }
    return;
  }

  chartContainer.style.display = '';

  const ordered = [...solves].reverse();
  const labels = ordered.map((_, i) => i + 1);
  const data = ordered.map(s => s.time / 1000);

  if (speedChart) {
    speedChart.data.labels = labels;
    speedChart.data.datasets[0].data = data;
    speedChart.update('none');
    return;
  }

  speedChart = new Chart(chartCanvas, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        data,
        borderColor: '#7c4dff',
        backgroundColor: 'rgba(124, 77, 255, 0.1)',
        borderWidth: 1.5,
        pointRadius: solves.length > 50 ? 0 : 2,
        pointHoverRadius: 4,
        pointBackgroundColor: '#7c4dff',
        fill: true,
        tension: 0.3
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (tip) => formatTime(tip.parsed.y * 1000)
          }
        }
      },
      scales: {
        x: {
          display: true,
          title: { display: false },
          ticks: { color: '#555', font: { size: 10 }, maxTicksLimit: 10 },
          grid: { color: '#222' }
        },
        y: {
          display: true,
          title: { display: false },
          ticks: {
            color: '#555',
            font: { size: 10 },
            callback: (v) => formatTime(v * 1000)
          },
          grid: { color: '#222' }
        }
      },
      interaction: { intersect: false, mode: 'index' }
    }
  });
}
