import path from 'path';

// import express from 'express';
// import http from 'http';
// import WebSocket from 'ws';

import twilio from 'twilio';
import dotenv from 'dotenv';
import ngrok from 'ngrok';

dotenv.config();

const sessions = new Map();
const contacts = new Map();


/*
    Dinâmica para resetar a história:
    * se não tiver ligação em andamento
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

import Fastify from "fastify";
import fastifyWs from "@fastify/websocket";
// import fastifyMultipart from 'fastify-multipart';

import fastifyFormBody from "@fastify/formbody";

const fastify = Fastify({
    logger: false
});
fastify.register(fastifyWs);
fastify.register(fastifyFormBody);




const answerCall = async (res, twiml) => {

    res.type('text/xml').send(twiml.toString());
    console.log('FINAL', twiml.toString());
}

const sendTwilioMessage = async (contact, message) => {
    console.log('sending message', contact);
    await twilioClient.messages.create({
        from: contact.to,
        to: contact.from,
        body: message
    });
};



fastify.get('/', (req, res) => {
    console.log('GET ROOT');
    res.type('text/html').send(`https://${req.headers['x-forwarded-host']}/call<br/><br/><a href="https://wa.me/${TWILIO_PHONE_NUMBER}">${TWILIO_PHONE_NUMBER}</a>`)
    //   res.render('index');
});


fastify.all('/message', (req, res) => {
    console.log('RECEIVED MESSAGE', req.body);
    const twiml = new twilio.twiml.MessagingResponse();


    // TODO: ver se o participante já está no banco de dados
    if (!contacts.has(req.body.From)) {
        contacts.set(req.body.From, {
            from: req.body.From,
            to: req.body.To,
            callSid: null,
            profileName: req.body.ProfileName,
            setupDone: false,
            authorSelected: false,
            emailVerified: false,
            email: null,
            startingPoint: null,
            historyGenre: null,
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

        } else {
            const otpRegex = /^\d{6}$/;
            if (otpRegex.test(req.body.Body)) {
                twiml.message('Verificando OTP...');

                contact.emailVerified = true; // TODO: remove this
                contacts.set(req.body.From, contact);
                twiml.message('Envie um ponto de partida e um gênero da sua história para começarmos?');

            } else {
                // TODO: Validar OTP recebido com Verify
                twiml.message('Por favor, informe um e-mail válido para continuar.');
            }
        }
        return answerCall(res, twiml);
    }

    // }

    if (!contact.setupDone) {
        contact.startingPoint = req.body.Body;
        contact.setupDone = true;

        twiml.message('Pronto! Agora só fazer a ligação aqui mesmo no WhatsApp');


        // twiml.message('Setup ainda não concluído. Estou te enviando um formulário para preencher...');
        // twiml.message('Envie um ponto de partida e um gênero da sua história para começarmos?');
        // TODO: se não tiver em andamento, envia novamente o template para criar a história
        return answerCall(res, twiml);
    }

    if (!contact.CallSid) {
        // TODO: se não tiver com ligação em andamento, informa para ligar ou inicia a ligação programaticamente.
        console.log(contact);
        twiml.message('Inicie uma ligação para começar a história!');
        return answerCall(res, twiml);
    }

    switch (req.body.MessageType) {
        case 'image':
            // TODO: add image as media on OpenAI call
            break;
        case 'text':
            break;
    }

    if (contact.ws) {
        console.log('SENDING TO WebSocket...')
        contact.ws.send(
            JSON.stringify({
                type: "text",
                token: req.body.Body,
                last: true,
            })
        );

    } else {
        console.log('NO WEBSOCKET', contact);
    }


    // inclui o texto ou imagem no contexto e continua a história

    return answerCall(res, twiml);

});


fastify.all('/ended', (req, res) => {
    console.log('CALL ENDED BY CONVERSATION RELAY', req.body);
    // const contact = contacts.get(req.body.From);
    // req.body.From;
    // req.body.CallSid;
    res.status(200).end();
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
            setupDone: false,
            authorSelected: false,
            emailVerified: false,
            email: null,
            startingPoint: null,
            historyGenre: null,
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
        return answerCall(res, twiml);
    }

    // TODO: check if the person have answered the setup message
    if (!contact.authorSelected) {

        /*
        William Shakespeare: Drama, Poetry
        J.K. Rowling: Fantasy
        Charles Dickens: Novel, Social Critique
        Jane Austen: Novel, Romance
        George Orwell: Dystopian, Political, Satire
        Mark Twain: Adventure, humor, satire
        Agatha Christie: Mystery, detective fiction
        J.R.R. Tolkien: Epic fantasy
        Ernest Hemingway: Literary fiction with adventure
        */
        // TODO: se não tiver em andamento, envia novamente o template para criar a história
        twiml.say('Você precisa escolher um autor que gostaria de se inspirar. Vou te enviar uma lista de opções no WhatsApp');
        // HX0f3d20b0ccb65c17ba7405510d619399
        
        // TODO: enviar a lista de autores como base
        return answerCall(res, twiml);
    }
    if (!contact.setupDone) {
        // TODO: se não tiver em andamento, envia novamente o template para criar a história
        twiml.say('Vi que você ainda não definiu sua primeira história. Vou te enviar pelo WhatsApp um formulário para criá-la.');
        // TODO: enviar a lista de autores como base
        return answerCall(res, twiml);
    }

    // TODO: if yes, create the conversation relay connection telling the story settings

    let greeting = '';

    greeting = `${WELCOME_GREETING}\nVou contar uma história começando por ${contact.startingPoint}...`;

    twiml.say('Conectando com servidor...');
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
        voice: VOICE,
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
            sendTwilioMessage(ws.contact, `Eu vou enviar a história completa para seu e-mail ${ws.contact.email}.\n\nSe quiser ouvir mais, basta ligar novamente.`);
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

