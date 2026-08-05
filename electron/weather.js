const https = require('https');

function httpGetJson(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'desktop-pigeon-pet' } }, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (err) {
          reject(err);
        }
      });
    }).on('error', reject);
  });
}

function mapWeatherCode(code) {
  // Open-Meteo WMO weather codes: 51-67,80-82 = rain family, 71-77,85-86 = snow family
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) return 'rain';
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return 'snow';
  return 'clear';
}

let lastKnownCondition = 'clear';

async function fetchWeather() {
  try {
    const geo = await httpGetJson('http://ip-api.com/json/?fields=lat,lon,status');
    if (geo.status !== 'success') throw new Error('geolocation failed');

    const meteo = await httpGetJson(
      `https://api.open-meteo.com/v1/forecast?latitude=${geo.lat}&longitude=${geo.lon}&current_weather=true`
    );
    const code = meteo.current_weather.weathercode;
    lastKnownCondition = mapWeatherCode(code);
    return { condition: lastKnownCondition, ok: true };
  } catch (err) {
    // Per spec: fall back to last known condition, or 'clear' if none yet.
    return { condition: lastKnownCondition, ok: false };
  }
}

function startWeatherPolling(onUpdate, intervalMs = 30 * 60 * 1000) {
  const run = () => fetchWeather().then(onUpdate);
  run();
  const timer = setInterval(run, intervalMs);
  return () => clearInterval(timer);
}

module.exports = { fetchWeather, startWeatherPolling, mapWeatherCode };
