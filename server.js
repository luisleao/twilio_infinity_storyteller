import path from 'path';

// import express from 'express';
// import http from 'http';
// import WebSocket from 'ws';

import twilio from 'twilio';
import dotenv from 'dotenv';
import ngrok from 'ngrok';
import OpenAI from 'openai';
import axios from 'axios';

dotenv.config();

const sessions = new Map();
const contacts = new Map();



const downloadTwilioMedia = async (mediaUrl) => {
    const { TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN } = process.env;

    return await axios
        .get(mediaUrl, {
            responseType: 'arraybuffer',
            auth: {
                username: TWILIO_ACCOUNT_SID,
                password: TWILIO_AUTH_TOKEN
            }
        })
        .then(response => {
            const result = {
                contentType: response.headers['content-type'],
                base64: Buffer.from(response.data, 'binary').toString('base64')
            }
            return result;
        }).catch(e => {
            console.error('ERROR!', e);
            return null;
        });
}


/*
    Dinâmica para resetar a história:
    * se não tiver ligação em andamento

    // TODO: trocar template de mensagem para remover nome do autor na descrição
    // TODO: implementar verify do email
    // TODO: implementar descrição da foto para usar só texto no chatGPT
    // DONE: implementar OpenAI

*/



const {
    PRODUCTION,
    OPENAI_API_KEY,
    VOICE,
    WELCOME_GREETING,
    WELCOME_GREET_LANGUAGE,
    TRANSCRIPTION_LANGUAGE,
    INTERRUPTIBLE,
    DTMF_DETECTION,
    SYSTEM_PROMPT,
    TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN,
    TWILIO_PHONE_NUMBER
} = process.env;

const PORT = parseInt(process.env.PORT) || process.argv[3] || 8080;
const { NGROK_ACTIVE, NGROK_TOKEN, NGROK_SUBDOMAIN } = process.env;
let SERVER = '';

const twilioClient = new twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);

const openai = new OpenAI({
    apiKey: OPENAI_API_KEY, // This is the default and can be omitted
});


import Fastify from "fastify";
import fastifyWs from "@fastify/websocket";
// import fastifyMultipart from 'fastify-multipart';

import fastifyFormBody from "@fastify/formbody";

const fastify = Fastify({
    logger: false
});
fastify.register(fastifyWs);
fastify.register(fastifyFormBody);


const authors = {
    'William Shakespeare': {
        'name': 'William Shakespeare',
        'topic': 'Drama, Poetry',
        'voices': ['NFG5qt843uXKj4pFvR7C', '1hlpeD1ydbI2ow0Tt3EW']
    },
    'J.K. Rowling': {
        'name': 'J.K. Rowling',
        'topic': 'Fantasy',
        'voices': ['kqVT88a5QfII1HNAEPTJ', 'h2sm0NbeIZXHBzJOMYcQ']
    },
    'Charles Dickens': {
        'name': 'Charles Dickens',
        'topic': 'Novel, Social Critique',
        'voices': ['EkK5I93UQWFDigLMpZcX', 'H1GhCI6GEKiSXZcwmUkc']
    },
    'Jane Austen': {
        'name': 'Jane Austen',
        'topic': 'Novel, Romance',
        'voices': ['LruHrtVF6PSyGItzMNHS', 'KoVIHoyLDrQyd4pGalbs']
    },
    'George Orwell': {
        'name': 'George Orwell',
        'topic': 'Dystopian, Political, Satire',
        'voices': ['pVnrL6sighQX7hVz89cp', 'lxYfHSkYm1EzQzGhdbfc']
    },
    'Mark Twain': {
        'name': 'Mark Twain',
        'topic': 'Adventure, humor, satire',
        'voices': ['OYTbf65OHHFELVut7v2H', '7S3KNdLDL7aRgBVRQb1z']
    },
    'Agatha Christie': {
        'name': 'Agatha Christie',
        'topic': 'Mystery, detective fiction',
        'voices': ['NOpBlnGInO9m6vDvFkFC', 'G17SuINrv2H9FC6nvetn' ]
    },
    'J.R.R. Tolkien': {
        'name': 'J.R.R. Tolkien',
        'topic': 'Epic fantasy',
        'voices': ['hU1ratPhBTZNviWitzAh', 'raMcNf2S8wCmuaBcyI6E']
    },
    'Ernest Hemingway': {
        'name': 'Ernest Hemingway',
        'topic': 'Literary fiction with adventure',
        'voices': ['i4CzbCVWoqvD0P1QJCUL', 'fCxG8OHm4STbIsWe4aT']
    },
    'Stephen King': {
        'name': 'Stephen King',
        'topic': 'Horror and suspense',
        'voices': ['NMilCCbfoygNnI2VZ7ME', 'NYC9WEgkq1u4jiqBseQ']
    }

}

/*
Suspense/policial: 'EkK5I93UQWFDigLMpZcX', 'G17SuINrv2H9FC6nvetn', 'NOpBlnGInO9m6vDvFkFC'
    James - Husky & Engaging - EkK5I93UQWFDigLMpZcX
    Christopher - G17SuINrv2H9FC6nvetn
    Grandpa Spuds Oxley - NOpBlnGInO9m6vDvFkFC
Comédia: 'OYTbf65OHHFELVut7v2H', '7S3KNdLDL7aRgBVRQb1z'
    Hope - natural conversations - OYTbf65OHHFELVut7v2H
    Nathaniel C. - Deep Rich - 7S3KNdLDL7aRgBVRQb1z
sci-fi: 'hU1ratPhBTZNviWitzAh', '9Ft9sm9dzvprPILZmLJl', 'raMcNf2S8wCmuaBcyI6E'
    Curt - Midwestern Man - hU1ratPhBTZNviWitzAh
    Patrick International - 9Ft9sm9dzvprPILZmLJl
    Tyler Kurk - raMcNf2S8wCmuaBcyI6E
Drama: 'NMilCCbfoygNnI2VZ7ME', '8Es4wFxsDlHBmFWAOWRS'
    Austin - Dramatic Narration - NMilCCbfoygNnI2VZ7ME
    William Shanks - 8Es4wFxsDlHBmFWAOWRS
*/


const answerRequest = async (res, twiml) => {

    res.type('text/xml').send(twiml.toString());
    console.log('FINAL', twiml.toString());
}

const sendTwilioMessage = async (contact, message, templateId) => {
    console.log('sending message', message, templateId);
    await twilioClient.messages.create({
        from: contact.to,
        to: contact.from,
        contentSid: templateId,
        body: message
    });
};


const getRandomAuthor = async () => {
    const authorNames = Object.keys(authors);
    const randomIndex = Math.floor(Math.random() * authorNames.length);
    const randomAuthor = authors[authorNames[randomIndex]];
    console.log('GETING AUTHOR', randomIndex, authorNames, randomAuthor);
    return randomAuthor;
}


fastify.get('/', (req, res) => {
    console.log('GET ROOT');
    res.type('text/html').send(`https://${req.headers['x-forwarded-host']}/call<br/><br/><a href="https://wa.me/${TWILIO_PHONE_NUMBER}">${TWILIO_PHONE_NUMBER}</a>`)
    //   res.render('index');
});


fastify.all('/message', async (req, res) => {
    console.log('RECEIVED MESSAGE', req.body);
    const twiml = new twilio.twiml.MessagingResponse();


    // TODO: ver se o participante já está no banco de dados
    if (!contacts.has(req.body.From)) {
        contacts.set(req.body.From, {
            from: req.body.From,
            to: req.body.To,
            callSid: null,
            profileName: req.body.ProfileName,
            setupDone: true, //false,
            authorSelected: true, //false,
            author: await getRandomAuthor(), //null
            emailVerified: true, //false,
            email: 'luis.leao@gmail.com', //null,
            messages: [],

        })
    }



    // TODO: verificar se é resposta de um WhatsApp Flows

    // TODO: pede o e-mail para validar e depois faz o OTP com Verify/SendGrid
    // TODO: se receber OTP verifica a validação


    const contact = contacts.get(req.body.From);

    // if (PRODUCTION === true) {

    // TODO: verifica se email foi confirmado ou se recebeu OTP
    if (!contact.emailVerified) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        // TODO: confirmar que texto enviado é um e-mail
        if (emailRegex.test(req.body.Body.toLowerCase())) {
            contact.email = req.body.Body.toLowerCase();
            contacts.set(req.body.From, contact);

            // TODO: criar Verify para o e-mail informado
            twiml.message('Enviei um código para seu e-mail. Responda ele aqui por favor para continuar.');
            return answerRequest(res, twiml);

        } else {
            const otpRegex = /^\d{6}$/;
            if (!otpRegex.test(req.body.Body)) {
                twiml.message('Por favor, informe um e-mail válido para continuar.');
                return answerRequest(res, twiml);
            }

            // TODO: Validar OTP recebido com Verify
            // twiml.message('Verificando OTP...'); // TODO: remover esta mensagem

            contact.emailVerified = true; // TODO: remove this
            contacts.set(req.body.From, contact);

        }
    }

    // }

    if (!contact.authorSelected) {
        if (req.body.ListId && req.body.ListId.includes('AUTHOR_')) {
            contact.authorSelected = true;
            contact.author = authors[req.body.ListId.split('AUTHOR_')[1]];
            contact.setupDone = true;

            twiml.message('Pronto! Agora só fazer a ligação e começar a enviar suas fotos ou mensagens pelo WhatsApp.');
            return answerRequest(res, twiml);
        }

        // TODO: send template: HX6541a086ace78877d50c5fba18a9aa0b
        await sendTwilioMessage(contact, null,'HX6541a086ace78877d50c5fba18a9aa0b');
        return answerRequest(res, twiml);

    }

    if (!contact.setupDone) {
        contact.setupDone = true;

        twiml.message('Pronto! Agora só fazer a ligação aqui mesmo no WhatsApp');


        // twiml.message('Setup ainda não concluído. Estou te enviando um formulário para preencher...');
        // twiml.message('Envie um ponto de partida e um gênero da sua história para começarmos?');
        // TODO: se não tiver em andamento, envia novamente o template para criar a história
        return answerRequest(res, twiml);
    }

    if (!contact.CallSid) {
        // TODO: se não tiver com ligação em andamento, informa para ligar ou inicia a ligação programaticamente.
        console.log(contact);
        twiml.message('Inicie uma ligação para começar a história!');
        return answerRequest(res, twiml);
    }


    switch (req.body.MessageType) {
        case 'image':
            console.log('recebi imagem:', req.body.MediaUrl0);
            // TODO: add image as media on OpenAI call
            const imageBase64 = await downloadTwilioMedia(req.body.MediaUrl0);
            console.log('adicionei imagem:', imageBase64);
            contact.messages.push({
                role: 'user',
                content: [
                    {  type: 'image_url', image_url: { url: `data:${imageBase64.contentType};base64,${imageBase64.base64}`  }}
                ]
            })

            break;
        case 'text':
            console.log('adicionei textos:', req.body.Body);
            contact.messages.push({
                role: 'user',
                content: [
                    { type: 'text', text: req.body.Body}
                ]
            })
            break;
    }



    // const conversation = sessions.get(ws.callSid);
    // conversation.push({ role: "user", content: message.voicePrompt });

    console.log('historia adicionada!', contact.messages);


    const response = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        // response_format: { "type": "json_object" },
        messages: [
            {
                role: 'system',
                content: [
                    // TODO: create system prompt with data
                    { 
                        type: 'text', 
                        text: `
                        conte uma história considerando as mensagens do usuário como um elemento para ser adicionado.
                        A cada nova mensagem do usuário deve adicionar mais uma parte da mesma história.
                        considere como inspiração para escrita, enredo e linguagem o author ${contact.author.name} no estilo ${contact.author.topic}.
                        não mencione em nenhum momento o author utilizado como inspiração.
                        a história em cada resposta deve ser breve pois está sendo contada ao telefone.
                        conte apenas a história e não faça nenhuma pergunta adicional.
                        a história deve ser sempre em inglês.
                        Não ultrapasse mais que 3 parágrafos e termine com a frase completa.
                        `
                    }
                ]
            },
            ...contact.messages
        ],
        // max_tokens: 100
    });
    const resposta = response.choices[0].message.content;

    contact.messages.push({
        role: 'assistant',
        content: [
            { type: 'text', text: resposta}
        ]
    })
    console.log('RESPOSTA:', resposta);
    // TODO: add voices here.


    twiml.message(resposta);
    // switch (req.body.MessageType) {
    //     case 'image':
    //         // TODO: add image as media on OpenAI call
    //         break;
    //     case 'text':
    //         break;
    // }

    if (contact.ws) {
        console.log('SENDING TO WebSocket...')
        contact.ws.send(
            JSON.stringify({
                type: "text",
                token: resposta,
                last: true,
            })
        );

    } else {
        console.log('NO WEBSOCKET', contact);
    }


    // inclui o texto ou imagem no contexto e continua a história

    return answerRequest(res, twiml);

});


fastify.all('/ended', (req, res) => {
    console.log('CALL ENDED BY CONVERSATION RELAY', req.body);
    const twiml = new twilio.twiml.VoiceResponse();
    // const contact = contacts.get(req.body.From);
    // req.body.From;
    // req.body.CallSid;
    return answerRequest(res, twiml);
});

fastify.all('/call', async (req, res) => {

    console.log('RECEIVED CALL', req.body);
    // Função utilizada para receber uma chamada
    // Ela responde com um objeto do ConversationRelay incluindo os parâmetros necessários para a chamada
    const twiml = new twilio.twiml.VoiceResponse();


    if (!contacts.has(req.body.From)) {
        contacts.set(req.body.From, {
            callSid: null,
            from: req.body.From,
            to: req.body.To,
            profileName: req.body.ProfileName,
            setupDone: true, //false,
            authorSelected: true, //false,
            author: await getRandomAuthor(), //null
            emailVerified: true, //false,
            email: 'luis.leao@gmail.com', //null,
            messages: [],
        });
    }



    // TODO: verificar se é resposta de um WhatsApp Flows
    // TODO: pede o e-mail para validar e depois faz o OTP com Verify/SendGrid
    // TODO: se receber OTP verifica a validação


    const contact = contacts.get(req.body.From);


    contact.CallSid = req.body.CallSid;
    contacts.set(req.body.From, contact);



    // TODO: verifica se email foi confirmado ou se recebeu OTP
    if (!contact.emailVerified) {
        twiml.say('Para continuar, você deve enviar e validar seu e-mail pelo WhatsApp!');
        return answerRequest(res, twiml);
    }

    // TODO: check if the person have answered the setup message
    if (!contact.authorSelected) {

        // TODO: se não tiver em andamento, envia novamente o template para criar a história
        twiml.say('Você precisa escolher um autor que gostaria de se inspirar. Vou te enviar uma lista de opções no WhatsApp');
        // TODO: send template: HX6541a086ace78877d50c5fba18a9aa0b

        // TODO: enviar a lista de autores como base
        return answerRequest(res, twiml);
    }
    if (!contact.setupDone) {
        // TODO: se não tiver em andamento, envia novamente o template para criar a história
        twiml.say('Vi que você ainda não definiu sua primeira história. Vou te enviar pelo WhatsApp um formulário para criá-la.');
        // TODO: enviar a lista de autores como base
        return answerRequest(res, twiml);
    }

    // TODO: if yes, create the conversation relay connection telling the story settings

    const voices = contact.author.voices;
    console.log('AUTHOR', contact.author);
    console.log('voices', voices)
    const chosenVoice = voices.length > 0 ? voices[Math.floor(Math.random() * voices.length)] : '';
    console.log('chosenVoice', chosenVoice)

    let greeting = '';

    greeting = `Olá, quero dar boas-vindas ao AI Infinite Storyteller.
        Vou contar uma história utilizando como referência ${contact.author}...
        Você pode modificar esta história enviando fotos ou textos para adicionar novos elementos.
        Para concluir, basta desligar a ligação.
        Enviaremos um email com sua história`;

    greeting = `Welcome to Infinity Storyteller!
    I'll use ${contact.author.name} as a reference for your story.`;


    const connect = twiml.connect({
        action: `https://${req.headers['x-forwarded-host']}/ended`,
        // action: `https://workshoptdc.ngrok.io/connect`,
    });
    const conversationrelay = connect.conversationRelay({
        url: `wss://${req.headers['x-forwarded-host']}/ws`,
        // url: `wss://workshoptdc.ngrok.io}/`,

        welcomeGreeting: greeting, //.split('{nome}').join('desconhecido'), 
        welcomeGreetingLanguage: WELCOME_GREET_LANGUAGE,
        transcriptionLanguage: TRANSCRIPTION_LANGUAGE,
        voice: chosenVoice,
        interruptible: INTERRUPTIBLE,
        dtmfDetection: DTMF_DETECTION,

    });

    conversationrelay.parameter({
        name: 'NOME_DO_PARAMETRO',
        value: 'VALOR_DO_PARAMETRO'
    });

    res.type('text/xml').code(200);
    // res.send(twiml.toString());
    console.log('FINAL', twiml.toString());
    return twiml.toString();


});
fastify.register(async function (fastify) {
    fastify.get("/ws", { websocket: true }, (ws, req) => {

        ws.on("message", async (data) => {
            const message = JSON.parse(data);
            switch (message.type) {
                case "setup":
                    const callSid = message.callSid;
                    console.log("Setup for call:", callSid);
                    console.log('CALL DATA', message);

                    const contact = contacts.get(message.from);
                    contact.ws = ws;
                    contacts.set(message.from, contact);

                    ws.callSid = callSid;
                    ws.contact = contact;
                    sessions.set(callSid, [{ role: "system", content: SYSTEM_PROMPT }]);
                    break;

                case "prompt":
                    console.log("Processing prompt:", message.voicePrompt);
                    const conversation = sessions.get(ws.callSid);
                    conversation.push({ role: "user", content: message.voicePrompt });

                    // const response = await aiResponse(conversation);
                    // conversation.push({ role: "assistant", content: response });

                    ws.send(
                        JSON.stringify({
                            type: "text",
                            token: message.voicePrompt,
                            last: true,
                        })
                    );
                    await sendTwilioMessage(ws.contact, message.voicePrompt);
                    console.log("Sent response:"); //, response);
                    break;
                case "interrupt":
                    console.log("Handling interruption.");
                    break;
                default:
                    console.warn("Unknown message type received:", message.type);
                    break;
            }
        });
        ws.on("close", () => {
            console.log("WebSocket connection closed", ws);
            // TODO: send autoreply with 'RESET'
            sendTwilioMessage(ws.contact, `Eu vou enviar a história completa, baseada no author *${ws.contact.author.name}* para seu e-mail ${ws.contact.email}.\n\nSe quiser ouvir mais, basta ligar novamente.`);
            sessions.delete(ws.callSid);
        });
    });

});

try {
    fastify.listen({ port: PORT });
    console.log(`Listening on http://localhost:${PORT}`);

    SERVER = `https://demoleao.sa.ngrok.io`;
    if (NGROK_ACTIVE === true) {
        console.log('Starting NGROK...', PORT, NGROK_SUBDOMAIN);
        SERVER = await ngrok.connect({ authtoken: NGROK_TOKEN, addr: PORT, subdomain: NGROK_SUBDOMAIN });
    }
    console.log('URL:', SERVER);


} catch (err) {
    fastify.log.error(err);
    process.exit(1);
}









/*

const ngrok = require('ngrok');


const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });





// receive urlencoded post and json bodies
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

// app.use(express.static(path.join(__dirname, 'public')))
//     .set('views', path.join(__dirname, 'views'))
//     .set('view engine', 'ejs');

app.get('/', (req, res) => {
    console.log('GET ROOT');
    res.send(`https://${req.headers['x-forwarded-host']}/call`)
    //   res.render('index');
});









app.all('/call', (req, res) => {
    console.log('RECEIVED CALL', req.body);
    // Função utilizada para receber uma chamada
    // Ela responde com um objeto do ConversationRelay incluindo os parâmetros necessários para a chamada

    const twiml = new twilio.twiml.VoiceResponse();

    // TODO: check if the person have answered the setup message
    // TODO: if not, send the Flow form first and tell they need to complete
    // TODO: if yes, create the conversation relay connection telling the story settings


    twiml.say('Conectando com servidor...');
    const connect = twiml.connect({
        action: `https://${req.headers['x-forwarded-host']}/`,
        // action: `https://workshoptdc.ngrok.io/connect`,
    });
    const conversationrelay = connect.conversationRelay({
        url: `wss://${req.headers['x-forwarded-host']}/`,
        // url: `wss://workshoptdc.ngrok.io}/`,

        welcomeGreeting: WELCOME_GREETING, //.split('{nome}').join('desconhecido'), 
        welcomeGreetingLanguage: WELCOME_GREET_LANGUAGE,
        transcriptionLanguage: TRANSCRIPTION_LANGUAGE,
        voice: VOICE,
        interruptible: INTERRUPTIBLE,
        dtmfDetection: DTMF_DETECTION,

    });

    // conversationrelay.parameter({
    //     name: 'NOME_DO_PARAMETRO',
    //     value: 'VALOR_DO_PARAMETRO'
    // });

    // twiml.say('Teste do Leão!');

    res.type('text/xml');
    res.send(twiml.toString());
    console.log('FINAL', twiml.toString());

});






// WebSocket connection handler
wss.on('connection', (ws) => {
    console.log('WebSocket connection established', ws);

    ws.on('message', async (data) => {
        const message = JSON.parse(data);
        switch (message.type) {
            case 'setup':
                console.log('SETUP', message)
                ws.params = message;
                const personName = message.customParameters && message.customParameters.name ? message.customParameters.name : null;

                ws.send(JSON.stringify({
                    type: 'text',
                    token: 'Isso é um teste!',
                    last: true
                }));

                break;

            case 'interrupt':
                console.log('Interruption:', message);
                break;

            case 'prompt':

                console.log('Prompt:', message.voicePrompt);

                break;

            case 'dtmf':
                console.log('DTMF:', message);
                break;

            default:
                console.log('Unknown Message:', message);
        }
        console.log();

    });

    ws.on('close', () => {
        // TODO: enviar mensagem com opção para resetar e criar uma nova história
        // TODO: enviar resumo da história por e-mail
        console.log('WebSocket fechado');
        console.log(ws.params);
        console.log();
    });
});






app.listen(port, async () => {
    console.log(`Listening on http://localhost:${port}`);


    SERVER = `https://demoleao.sa.ngrok.io`;
    if (NGROK_ACTIVE === true) {
        console.log('Starting NGROK...', port, NGROK_SUBDOMAIN);
        SERVER = await ngrok.connect({ authtoken: NGROK_TOKEN, addr: port, subdomain: NGROK_SUBDOMAIN });
    }
    console.log('URL:', SERVER);

});

*/


process.on('SIGINT', async () => {
    console.log('\nGracefully shutting down SIGINT...');
    if (NGROK_ACTIVE) {
        try {
            await ngrok.kill();
            console.log('Ngrok tunnel closed.');
        } catch (err) {
            console.error('Error closing ngrok:', err);
        }
    }
    // server.close(() => {
    //     console.log('HTTP server closed.');
    process.exit(0);
    // });
});

process.on('SIGTERM', async () => {
    console.log('\nGracefully shutting down SIGTERM...');
    if (NGROK_ACTIVE) {
        try {
            await ngrok.disconnect();
            await ngrok.kill();
            console.log('Ngrok tunnel closed.');
        } catch (err) {
            console.error('Error closing ngrok:', err);
        }
    }
    // server.close(() => {
    //     console.log('HTTP server closed.');
    process.exit(0);
    // });
});

