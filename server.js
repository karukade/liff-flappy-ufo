'use strict';

const express = require('express')
const line = require('@line/bot-sdk')
const PORT = process.env.PORT || 3000

const config = {
    channelSecret: '',
    channelAccessToken: ''
}

const app = express()

app.post('/webhook', line.middleware(config), async (req, res) => {
    Promise
      .all(req.body.events.map(handleEvent))
      .then((result) => res.json(result))
})

const client = new line.Client(config);

async function handleEvent(event) {
  let mes = '';
  if (event.type !== 'things') {
    return Promise.resolve(null);
  }

  if(event.type === 'things' && event.things.type === 'link'){
    mes = 'デバイスと接続しました。';
  }else if(event.type === 'things' && event.things.type === 'unlink'){
    mes = 'デバイスとの接続を解除しました。';
  }
  return Promise.resolve(null);
}

app.listen(PORT);
console.log(`Server running at ${PORT}`);