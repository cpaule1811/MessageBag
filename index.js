import * as dotenv from 'dotenv'
import { Client, GatewayIntentBits, SlashCommandBuilder } from "discord.js";
import { createClient } from 'redis';

dotenv.config()

const redisClient = createClient();
redisClient.on('error', (err) => console.log('Redis Client Error:', err));
await redisClient.connect();

async function depositMessage(message, userId) {
    const messageAsJsonString = JSON.stringify(message);
    const result = await redisClient.lPush(`queue:${userId}`, messageAsJsonString)
    return result;
}

async function releaseMessages(userId) {
    const queueKey = `queue:${userId}`;
    const result = await redisClient.lRange(queueKey, 0, -1);

    const parsedResult = result.map(res => JSON.parse(res))

    await redisClient.lTrim(queueKey, -1, 0);

    console.log(parsedResult);

    return parsedResult;
     
}

const discordClient=new Client({
    intents:[
        GatewayIntentBits.DirectMessages,
		GatewayIntentBits.Guilds,
		GatewayIntentBits.GuildMessages,
		GatewayIntentBits.MessageContent,
    ]
});

const depositCommand = new SlashCommandBuilder()
	.setName('deposit')
	.setDescription('Store message on server.')
    .addStringOption(option => 
		option.setName('message')
			.setDescription('The message you would like to store.')
			.setRequired(true)
    );

const releaseCommand = new SlashCommandBuilder()
        .setName("release")
        .setDescription("Release messages to discord.")

let guild;

discordClient.once("ready", () =>{
    const guildId = "1023005290263740426";
	guild = discordClient.guilds.cache.get(guildId);
	let commands;

	if (guild){
		commands = guild.commands;
	}
	else {
		commands = discordClient.application?.commands;
	}

	commands?.create(depositCommand);
    commands?.create(releaseCommand);

	console.log("Bot reporting for duty.");
})

discordClient.on('interactionCreate', async (interaction) => {
    if (!interaction.isCommand()) return;

    if (!(interaction.commandName === 'deposit')) return;

    const body = interaction.options.data.find(arg => arg.name === "message").value;
    const channelId = interaction.channelId;
    const sender = interaction.member;

    const message = {
        body,
        channelId: channelId
    }

    await depositMessage(message, sender.userId);

    interaction.reply({ content: "message stored.", ephemeral: true })
});

discordClient.on('interactionCreate', async (interaction) => {
    if (!interaction.isCommand()) return;

    if (!(interaction.commandName === 'release')) return;

    const sender = interaction.member;
    const messages = await releaseMessages(sender.userId);

    messages.forEach(message => {
        const channel = discordClient.channels.cache.get(message.channelId);
        channel.send(`${message.body} \n\nsent by ${sender}`);
    });

    const content = messages.length ? "All messages sent." : "Queue is empty."

    interaction.reply({ content, ephemeral: true })
});

discordClient.login(process.env.TOKEN);