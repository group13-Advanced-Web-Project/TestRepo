const express = require('express');
const axios = require('axios');
const { CookieJar } = require('tough-cookie');
const { wrapper } = require('axios-cookiejar-support');
const puppeteer = require('puppeteer');
const app = express();

// Create a cookie jar
const cookieJar = new CookieJar();

// Enable Axios to use the cookie jar
const apiClient = wrapper(
  axios.create({
    baseURL: 'https://www.finnkino.fi/xml',
    jar: cookieJar,
    withCredentials: true,
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.5',
      'Connection': 'keep-alive',
    },
  })
);

// Middleware to parse JSON
app.use(express.json());

let browser; // Declare browser variable globally

// Launch browser only once, before handling requests
const launchBrowser = async () => {
  if (!browser) {
    browser = await puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--disable-gpu',
        '--no-first-run',
        '--no-zygote',
        '--single-process',
      ],
    });
  }
  return browser;
};

// Example endpoint using Puppeteer to scrape the website
app.get('/', async (req, res) => {
  const startTime = Date.now(); // Start tracking the overall time

  try {
    console.log("Using existing browser...");
    const browserInstance = await launchBrowser();
    const pageStartTime = Date.now();
    const page = await browserInstance.newPage();
    console.log(`Page created in ${Date.now() - pageStartTime}ms`);

    // Block unnecessary resources like images, stylesheets, and scripts
    await page.setRequestInterception(true);
    page.on('request', (request) => {
      if (['image', 'stylesheet', 'font', 'script'].includes(request.resourceType())) {
        request.abort();
      } else {
        request.continue();
      }
    });

    // Set a realistic user agent
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36'
    );

    // Navigate to the target URL
    const navigationStartTime = Date.now();
    await page.goto('https://www.finnkino.fi/xml/Schedule', { waitUntil: 'domcontentloaded' });
    console.log(`Navigation took ${Date.now() - navigationStartTime}ms`);

    // Detect Cloudflare challenge or CAPTCHA
    const challengeStartTime = Date.now();
    const isChallengePage = await page.evaluate(() =>
      document.body.innerText.includes('Verify you are human')
    );
    console.log(`Cloudflare challenge check took ${Date.now() - challengeStartTime}ms`);

    if (isChallengePage) {
      console.error('Cloudflare challenge detected.');
      return res.status(403).json({ error: 'Blocked by Cloudflare challenge' });
    }

    // Extract content
    const contentStartTime = Date.now();
    const data = await page.content();
    console.log(`Content extraction took ${Date.now() - contentStartTime}ms`);

    // Send HTML content back
    console.log(`Total processing time: ${Date.now() - startTime}ms`);

    const xmlStartIndex = data.indexOf('<Schedule');
    const xmlData = data.substring(xmlStartIndex);
    const lines = xmlData.split('\n').slice(0, 10).join('\n');
    console.log('First 10 lines of data:', lines);

    res.status(200).send(data);
  } catch (error) {
    console.error('Puppeteer Error:', error);
    res.status(500).json({ error: 'Something went wrong' });
  }
});

// Endpoint to fetch data via Axios
app.get('/api/data', async (req, res) => {
  try {
    const apiStartTime = Date.now();
    const response = await apiClient.get('/Schedule');
    console.log(`API request took ${Date.now() - apiStartTime}ms`);
    res.status(200).json(response.data);
  } catch (error) {
    console.error('Axios Error:', error);
    res.status(500).json({ error: 'Failed to fetch data from the API' });
  }
});

// Start the server
const PORT = 3000;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
