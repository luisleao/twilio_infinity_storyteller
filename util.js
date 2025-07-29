import axios from 'axios';

exports.escondeNumero = function(number) {
    // +5511999991234 => +55119****-1234
    if (number) number = number.replace('whatsapp:', '');
    if (!number || number.length < 12) return '+-----****-----';
    return number.substr(0, number.length - 8) + '****-' + number.substr(number.length - 4 )
}

exports.primeiroNome = function(nome) {
    return `${nome}`.split(' ')[0];
}
exports.adicionaPais = function(number) {
    if(number.indexOf('+') < 0) {
        return `+55${number}`
    }
    return number;
}
exports.limpaNumero = function(number, removeMais) {
    if (number) number = number.replace('whatsapp:', '');
    if (number && removeMais) number = number.replace('+', '');
    return number;
}

exports.getDDD = function(number) {
    if (number) number = number.replace('whatsapp:+', '');
    number = number.substr(0,4);
    return number;
}

exports.validateEmail = function(email) {
    const re = /^(([^<>()[\]\\.,;:\s@\"]+(\.[^<>()[\]\\.,;:\s@\"]+)*)|(\".+\"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;
    return re.test(email);
}


exports.downloadTwilioMedia = async (mediaUrl) => {
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
