import path from 'path';

// import express from 'express';
// import http from 'http';
// import WebSocket from 'ws';

import twilio from 'twilio';
import dotenv from 'dotenv';
import ngrok from 'ngrok';
import OpenAI from 'openai';
import axios from 'axios';
import sgMail from '@sendgrid/mail';


dotenv.config();

const sessions = new Map();
const contacts = new Map();

const { DEFAULT_EMAIL } = process.env;

const ADS_TIMER = 60 * 1000;


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

const sendStoryEmail = async (contact) => {

    contact.messages = contact.messages.filter( m => ['assistant'].includes(m.role));
    sgMail.setApiKey(process.env.SENDGRID_API_KEY);

    const msg = {
        to: contact.email,
        from: process.env.SENDGRID_FROM_EMAIL,
        templateId: process.env.SENDGRID_TEMPLATE_ID,
        dynamic_template_data: {
            author: contact.author?.name,
            story: contact.messages.map(m => m.content[0])
        }
    };

    try {
        await sgMail.send(msg);
        console.log(`Story email sent to ${contact.email}`);
    } catch (error) {
        console.error('Error sending story email:', error);
        console.log('BODY', error.response.body.errors)
    }
}


/*
    Dinâmica para resetar a história:
    * se não tiver ligação em andamento

    // TODO: trocar template de mensagem para remover nome do autor na descrição
    // TODO: implementar verify do email
    // TODO: email template SendGrid
    // TODO: deixa ligar e manda whatsapp pedindo um dos autores
    // TODO: 


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

const DEFAULT_VOICE = 'NFG5qt843uXKj4pFvR7C';



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



    // Ver se o participante já está no banco de dados
    if (!contacts.has(req.body.From)) {
        contacts.set(req.body.From, {
            from: req.body.From,
            to: req.body.To,
            callSid: null,
            profileName: req.body.ProfileName,
            setupDone: true, //false,
            authorSelected: false, //false,
            author: null, //await getRandomAuthor(), //null
            emailVerified: false, //false,
            email: null, //DEFAULT_EMAIL, //null,
            messages: [],
        })
    }



    // TODO: verificar se é resposta de um WhatsApp Flows
    // TODO: pede o e-mail para validar e depois faz o OTP com Verify/SendGrid
    // TODO: se receber OTP verifica a validação


    const contact = contacts.get(req.body.From);

    // if (PRODUCTION === true) {
    resetTimeout(contact);

    // TODO: verifica se email foi confirmado ou se recebeu OTP
    if (!contact.emailVerified) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        // TODO: confirmar que texto enviado é um e-mail
        if (emailRegex.test(req.body.Body.toLowerCase())) {
            contact.email = req.body.Body.toLowerCase();
            contact.emailVerified = true; // TODO: remove this
            contacts.set(req.body.From, contact);

            // TODO: criar Verify para o e-mail informado
            twiml.message('Your e-mail is set! Now you can just make a call to start.');
            return answerRequest(res, twiml);

        } else {
            const otpRegex = /^\d{6}$/;
            if (!otpRegex.test(req.body.Body)) {
                twiml.message('Please sent a valid e-mail address to continue.');
                return answerRequest(res, twiml);
            }

            // TODO: Validar OTP recebido com Verify
            // twiml.message('Verificando OTP...'); // TODO: remover esta mensagem

            contact.emailVerified = true; // TODO: remove this
            contacts.set(req.body.From, contact);

        }
    }

    // }


    // if (!contact.authorSelected) {
    //     await sendTwilioMessage(contact, null,'HXac2bb32b71ece255681420ea18d4875e');
    //     return answerRequest(res, twiml);
    // }


    // if (!contact.CallSid) {
    //     // TODO: se não tiver com ligação em andamento, informa para ligar ou inicia a ligação programaticamente.
    //     console.log(contact);
    //     twiml.message('Inicie uma ligação para começar a história!');
    //     return answerRequest(res, twiml);
    // }

    console.log('');
    console.log('');
    console.log('req.body.MessageType', req.body.MessageType);
    console.log('');
    console.log('');

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

        case 'interactive':
            console.log('req.body.ListId', req.body.ListId);
            if (req.body.ListId && req.body.ListId.includes('AUTHOR_')) {
                let authorId = req.body.ListId.split('AUTHOR_')[1].split(':')[0];

                console.log('CHANGING AUTHOR', authorId);
                contact.authorSelected = true;
                contact.author = authors[authorId]; //authors[req.body.ListId.split('AUTHOR_')[1]];
                contact.setupDone = true;

                console.log('AUTHOR', authors[authorId]);

                contacts.set(req.body.From, contact);
                console.log('contact.CallSid && contact.ws', contact.CallSid)

                if (contact.CallSid && contact.ws) {
                    console.log('SEND END TO CHANGE AUTHOR...')
                    // TODO: se não tiver com ligação em andamento, informa para ligar ou inicia a ligação programaticamente.
                    contact.ws.send(
                        JSON.stringify({
                            type: "text",
                            token: "",
                            last: true,
                        })
                    );
                    contact.ws.send(
                        JSON.stringify({
                            "type": "end",
                            "handoffData": "{\"reasonCode\":\"switch\"}"
                        })
                    );
                } else {
                    twiml.message('Pronto! Agora só fazer a ligação e começar a enviar suas fotos ou mensagens pelo WhatsApp.');
                }
                return answerRequest(res, twiml);
            }
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
                        Você é um contador de histórias que deve considerar como inspiração para escrita, enredo e linguagem o author ${contact.author.name} no estilo ${contact.author.topic}..
                        Conte uma história considerando as mensagens do usuário como um novo elemento para ser adicionado na história existente.
                        Este elemento deve conectar com a história anterior já contada e você deve construir uma ligação entre cada novo elemento enviado pelo usuário com o elemento já contado pelo assistente anteriormente.
                        Você precisa explicar como o personagem chegou da parte anterior da história para a nova.
                        Você pode dar nome aos personagens ao contar a história.
                        
                        Não mencione em nenhum momento o author utilizado como inspiração.
                        A história em cada resposta deve ser breve pois está sendo contada ao telefone.
                        Conte apenas a história e não faça nenhuma pergunta adicional, mesmo que a imagem esteja repetida.
                        A história deve ser sempre em inglês.
                        Não ultrapasse mais que 1 parágrafo e termine com a frase completa.
                        Se utilizar termos como 'Once upon a time', não repita eles novamente nas outras respostas.
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

    contact.messages = contact.messages.filter( m => m.role !== 'user');

    console.log('MESSAGES', JSON.stringify(contact.messages));


    twiml.message(resposta);
    // switch (req.body.MessageType) {
    //     case 'image':
    //         // TODO: add image as media on OpenAI call
    //         break;
    //     case 'text':
    //         break;
    // }

    if (contact.ws) {
        // console.log('SENDING TO WebSocket...')
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


const addConversationRelay = async (contact, twiml, host) => {
    let greeting = '';

    if (contact.authorSelected) {
        await sendTwilioMessage(contact, `I'll start your stored using *${contact.author.name}* as an inspiration.\n\nPlease send any text or image so I can add them into your story.`)
    } else {
        await sendTwilioMessage(contact, null,'HXac2bb32b71ece255681420ea18d4875e');
    }
 
    

    let chosenVoice = DEFAULT_VOICE;
    if (contact.author) {
        const voices = contact.author.voices;
        chosenVoice = voices.length > 0 ? voices[Math.floor(Math.random() * voices.length)] : '';
    }

    const connect = twiml.connect({
        action: `https://${host}/ended`
    });

    const conversationrelay = connect.conversationRelay({
        url: `wss://${host}/ws`,
        welcomeGreeting: greeting, //.split('{nome}').join('desconhecido'), 
        welcomeGreetingLanguage: WELCOME_GREET_LANGUAGE,
        transcriptionLanguage: TRANSCRIPTION_LANGUAGE,
        voice: chosenVoice,
        // preemptible: false,
        interruptible: INTERRUPTIBLE,
        dtmfDetection: DTMF_DETECTION,
    });

    // conversationrelay.parameter({
    //     name: 'NOME_DO_PARAMETRO',
    //     value: 'VALOR_DO_PARAMETRO'
    // });

    return twiml;
}


fastify.all('/ended', async (req, res) => {
    console.log('CALL ENDED BY CONVERSATION RELAY', req.body);

    const twiml = new twilio.twiml.VoiceResponse();

    const contact = contacts.get(req.body.From);

    console.log('HandoffData', req.body.HandoffData);

    if (req.body.HandoffData) {
        const handoffData = JSON.parse(req.body.HandoffData);
        switch(handoffData.reasonCode) {
            case 'switch':
                console.log('SWITCH')
                return answerRequest(res, await addConversationRelay(contact, twiml, req.headers['x-forwarded-host']));
                break;
            default:
        }
    }
    
    if (contact.messages.length > 0) {
        await sendTwilioMessage(contact, `I will send the full story, based on the author *${contact.author.name}* to your email ${contact.email}.\n\nIf you want to hear more, just call back.\n\n\nIf you are insterested on this code, please access https://github.com/luisleao/twilio_infinity_storyteller`);
        await sendStoryEmail(contact);
    } else {
        await sendTwilioMessage(contact, `It looks like you haven’t created any stories yet.\n\nTo start a new one, just give us a call back.`);
    }
    sessions.delete(contact.callSid);

    contact.callSid = null;
    contact.author = null;
    contact.authorSelected = false;
    contact.messages = [];
    contacts.set(req.body.From, contact);

    return answerRequest(res, twiml);
});

fastify.all('/call', async (req, res) => {

    console.log('RECEIVED CALL', req.body);
    const twiml = new twilio.twiml.VoiceResponse();

    if (!contacts.has(req.body.From)) {
        contacts.set(req.body.From, {
            callSid: null,
            from: req.body.From,
            to: req.body.To,
            profileName: req.body.ProfileName,
            setupDone: true, //false,
            authorSelected: false, //false,
            author: null, //await getRandomAuthor(), //null
            emailVerified: false, //false,
            email: null, //DEFAULT_EMAIL, //null,
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
    if (!contact.email) {
        console.log('NO EMAIL')
        await sendTwilioMessage(contact, `Informe por aqui seu e-mail.`);
        twiml.say('Welcome to AI Infinite Storyteller. Please enter your email address to continue and call again.');
        return answerRequest(res, twiml);
   }
    if (!contact.emailVerified) {
        console.log('No verified email')
        await sendTwilioMessage(contact, `You need to send the registration code from your email.`);
        twiml.say('To continue, you must send and validate your email via WhatsApp!');
        return answerRequest(res, twiml);
    }

    return answerRequest(res, await addConversationRelay(contact, twiml, req.headers['x-forwarded-host']));

});
const resetTimeout = async (contact) => {
    console.log('Reseting Timeout...')
    if (contact.timer) {
        clearTimeout(contact.timer);
        contact.timer = null;
    }
    contact.timer = setTimeout(() => {
        contact.ws.send(
            JSON.stringify({
                "type": "text",
                "token": 'This story is brought to you by Twilio. Send more messages or images via WhatsApp to keep it going.',
                "last": true,
                "preemptible": true
            })
        );
        // contact.ws.send(
        //     JSON.stringify({
        //         "type": "play",
        //         "source": "https://demo.twilio.com/docs/classic.mp3",
        //         "loop": 1,
        //         "preemptible": true,
        //         "interruptible": false
        //     })
        // );
        
    }, ADS_TIMER);
}

fastify.register(async function (fastify) {
    fastify.get("/ws", { websocket: true }, (ws, req) => {

        ws.on("message", async (data) => {
            const message = JSON.parse(data);
            switch (message.type) {
                case "setup":
                    const callSid = message.callSid;
                    console.log('');
                    console.log("Setup for call:", callSid);
                    console.log('CALL DATA', message);

                    const contact = contacts.get(message.from);
                    contact.ws = ws;
                    resetTimeout(contact);
                    contacts.set(message.from, contact);

                    ws.callSid = callSid;
                    ws.contact = contact;
                    sessions.set(callSid, [{ role: "system", content: SYSTEM_PROMPT }]);

                    let greeting = '';

                    if (contact.authorSelected) {
                        greeting = `Hello! Welcome to the AI Infinite Storyteller.
                            I'll tell you a story inspired by ${contact.author.name}.
                            You can change the story by sending photos or texts to add new elements.
                            To finish, just hang up and we'll email you the story.`;

                    } else {
                        greeting = `Hello! Welcome to the AI Infinite Storyteller. To get started, you need to choose an author to inspire your story.
                            I've sent you a list of options via WhatsApp. Pick one and send it back..`
                    }
                    ws.send(
                        JSON.stringify({
                            type: "text",
                            token: greeting,
                            preemptible: true,
                            last: true,
                        })
                    );

                    break;

                case "prompt":
                    console.log("Processing prompt:", message.voicePrompt);
                    const conversation = sessions.get(ws.callSid);
                    conversation.push({ role: "user", content: message.voicePrompt });

                    // const response = await aiResponse(conversation);
                    // conversation.push({ role: "assistant", content: response });

                    // ws.send(
                    //     JSON.stringify({
                    //         type: "text",
                    //         token: message.voicePrompt,
                    //         last: true,
                    //     })
                    // );
                    // await sendTwilioMessage(ws.contact, message.voicePrompt);
                    // console.log("Sent response:"); //, response);
                    break;
                case "interrupt":
                    console.log("Handling interruption.");
                    break;
                default:
                    console.warn("Unknown message type received:", message.type);
                    break;
            }
        });
        ws.on("close", async () => {
            console.log("WebSocket connection closed");
            // TODO: send autoreply with 'RESET'
        });
    });

});

try {
    fastify.listen({ port: PORT });
    console.log(`Listening on http://localhost:${PORT}`);

    SERVER = `https://demoleao.ngrok.io`;
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

