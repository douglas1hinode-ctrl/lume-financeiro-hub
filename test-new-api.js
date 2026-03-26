const https = require('https');

const options = {
  hostname: 'api.painel.best',
  path: '/user/',
  method: 'GET',
  headers: {
    'Authorization': 'Bearer vkutkHDffmDmroO3_IM7WZEW8tEytCxlRqrG-vze2Xs',
    'User-Agent': 'Mozilla/5.0'
  }
};

const req = https.request(options, (res) => {
  let data = '';
  res.on('data', (chunk) => { data += chunk; });
  res.on('end', () => {
    console.log('Status:', res.statusCode);
    if(res.statusCode === 200) {
      console.log('Body:', data.substring(0, 500));
    } else {
      console.log('Error Body:', data.substring(0, 200));
    }
  });
});

req.on('error', (e) => {
  console.error(e);
});
req.end();
