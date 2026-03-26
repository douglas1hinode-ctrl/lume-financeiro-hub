const https = require('https');

function get(path) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.painel.best',
      path: path,
      method: 'GET',
      headers: { 'Api-Key': 'vkutkHDffmDmroO3_IM7WZEW8tEytCxlRqrG-vze2Xs' }
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', function(c) { data += c; });
      res.on('end', function() { resolve({ status: res.statusCode, body: data }); });
    });
    req.on('error', reject);
    req.end();
  });
}

get('/user/logs/?page=1&page_size=5').then(function(r) {
  var p = JSON.parse(r.body);
  console.log('count:', p.count, 'last_page:', p.last_page);
  var results = p.results || [];
  for (var i = 0; i < results.length; i++) {
    console.log('LOG' + i + ':', JSON.stringify(results[i]));
  }
}).catch(function(e) { console.error(e); });
