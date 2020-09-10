const axios = require("axios").default;
const config = require("./config.json");

axios.interceptors.response.use(res => {
	if (res.status != 200 && res.status != 204) {
		console.log(`AXIOS intercepted response:\n  - ${res.config.url} - ${res.status},\n  - Response: ${JSON.stringify(res.data)}`);
	}
	return res;
});

const statusNames = {
	1: {
		emoji: "🟢",
		name: "Up"
	},
	2: {
		emoji: "🔴",
		name: "Down"
	},
	3: {
		emoji: "🟡",
		name: "Limited"
	}
};

const DDToken = "Bearer eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzUxMiIsImtpZCI6ImlreDVkbnBxNmkifQ.eyJkZCI6eyJjb250ZXh0Ijp7InNjb3BlcyI6WyJmb28iLCJiYXIiXX19LCJpc3MiOiJhcGkiLCJpYXQiOjE1Njg5Njc1ODZ9.sXO5NCdAJDcQnJSjMAMtBx1JJ3Iz4jNFjQKsV6aLtgfr-M94dbKho57Qz6KKuS__9EsfsYJVadKAjqIReqtrlw";

async function GetRockstarInfo() {
	try {
		let RockstarRes = await axios({
			url: "http://support.rockstargames.com/services/status.json",
		});
		let RockstarData = [];
		RockstarData.push(RockstarRes.data.statuses[2]);
		RockstarData.push(RockstarRes.data.statuses[3]);
		RockstarData.push(RockstarRes.data.statuses[5]);
		return new Promise(resolve => {
			resolve(RockstarData);
		});
	} catch (err) {
		console.log(`Getting Rockstar info failed.\n  - ${err}`);
		return new Promise(resolve => resolve(false));
	}
}

async function GetDowndetectorInfo() {
	try {
		let dateNow = new Date();
		let datePrevious = new Date(new Date().setDate(new Date().getDate() - 1));
		let DDStatus = await axios({
			url: `https://downdetectorapi.com/v2/companies/${config.companyId}/statistics`,
			headers: {
				Authorization: DDToken
			},
			params: {
				startdate: datePrevious,
				enddate: dateNow,
				interval: config.interval
			}
		});
		return new Promise(resolve => resolve(DDStatus.data));
	} catch (err) {
		console.log(`Getting Downdetector info failed.\n  - ${err}`);
		return new Promise(resolve => resolve(false));
	}
}

async function SendEmbed(embed, messageId=false) {
	try {
		let isEdit = messageId;
		let data = await axios({
			method: isEdit ? "PATCH" : "POST",
			url: "https://discordapp.com/api/v6/channels/" + (isEdit ? (config.channelId + "/messages/" + messageId) : (config.channelId + "/messages")),
			data: {
				embed: embed
			},
			headers: {
				"Content-Type": "application/json",
				"Authorization": config.discordToken
			}
		});
		return new Promise(resolve => resolve(data));
	} catch (err) {
		console.log(`Sending/Patching embed failed.\n  - ${err}`);
		return new Promise(resolve => resolve(false));
	}
}

async function RenameChannel(name) {
	try {
		let data = await axios({
			method: "PATCH",
			url: "https://discordapp.com/api/v6/channels/" + config.channelId,
			data: {
				name: name
			},
			headers: {
				"Content-Type": "application/json",
				"Authorization": config.discordToken
			}
		});
		return new Promise(resolve => resolve(data.data));
	} catch (err) {
		console.log(`Patching channel failed.\n  - ${err}`);
		return new Promise(resolve => resolve(false));
	}
}

async function RenameCategory(name) {
	try {
		let data = await axios({
			method: "PATCH",
			url: "https://discordapp.com/api/v6/channels/" + config.categoryId,
			data: {
				name: name
			},
			headers: {
				"Content-Type": "application/json",
				"Authorization": config.discordToken
			}
		});
		return new Promise(resolve => resolve(data.data));
	} catch (err) {
		console.log(`Patching category failed.\n  - ${err}`);
		return new Promise(resolve => resolve(false));
	}
}

let lastMessageId = 0;
let lastEmbedContent = {};
let lastDown = false;
let worstStatus = 1;
const allEqual = arr => arr.every( v => v === arr[0] );

async function UpdateStatus() {
	let RockstarStatus = await GetRockstarInfo();
	let DowndetectorStatus = await GetDowndetectorInfo();

	if (RockstarStatus && DowndetectorStatus) {
		let RSServiceDown = false;
		let DowndetectorDown = false;

		for (let serviceInd in RockstarStatus) {
			let service = RockstarStatus[serviceInd];
			if (service.status > 1) {
				RSServiceDown = true;
			}
		}
		
		let LatestCount = DowndetectorStatus[DowndetectorStatus.length - 2].doc_count;
		if (DowndetectorStatus[DowndetectorStatus.length - 1].doc_count > config.flagCount) {
			LatestCount = DowndetectorStatus[DowndetectorStatus.length - 1].doc_count;
		}

		if (LatestCount > config.flagCount) DowndetectorDown = true;
		worstStatus = DowndetectorDown ? 3 : 1;

		let NewEmbed = {
			color: 7506394,
			footer: {
				icon_url: "https://gtaodiscord.com/f/137b3b.png",
				text: "discord.gg/gtao - Note: We are not affiliated with Rockstar"
			},
			thumbnail: {
				url: "https://gtaodiscord.com/f/137b3b.png"
			},
			author: {
				name: "GTA Online Service Status",
				url: "https://support.rockstargames.com/servicestatus",
				icon_url: "https://support.rockstargames.com/rockstar_games/meta/img/icons/support/apple-touch-icon.png"
			},
			fields: []
		};

		console.log(`Service Statuses:\n  - Downdetector: ${LatestCount},\n  - Rockstar: ${RSServiceDown ? "Services down" : "Services online"}`);

		if (RSServiceDown || DowndetectorDown) {
			NewEmbed.fields.push({name: "Downdetector", value: DowndetectorDown ? "🟡 Limited" : "🟢 Up"});
			let DownPlatforms = [];

			for (let serviceInd in RockstarStatus) {
				let service = RockstarStatus[serviceInd];

				let EmbedText = "";
				let statusArray = [];
				for (let platformInd in service.services_platforms) {
					let platform = service.services_platforms[platformInd];
					EmbedText += `${statusNames[platform.service_status.id].emoji} ` + platform.name + `\n`;
					statusArray.push(platform.service_status.id);
					if (platform.service_status.id > 1) DownPlatforms.push(platform);

					if (platform.service_status.id == 2) {
						worstStatus = 2;
					} else if (platform.service_status.id == 3 && worstStatus == 1) {
						worstStatus = 3;
					}
				}

				if (allEqual(statusArray)) {
					NewEmbed.fields.push({name: service.name, value: statusNames[statusArray[0]].emoji + " All services"});
				}  else {
					NewEmbed.fields.push({name: service.name, value: EmbedText});
				}
			}

			NewEmbed.author.name += " " + statusNames[worstStatus].emoji;
			NewEmbed.description = `Services currently appear to be ${statusNames[worstStatus].name}.\nStatus is ${statusNames[worstStatus].name} due to ${RSServiceDown ? `Rockstar's official status page` : `a high amount of Downdetector reports` }.\n\nMore info on [Downdetector](https://downdetector.com/status/gta5/) and [Rockstar's Status Page](https://support.rockstargames.com/servicestatus)`;
			
			if (JSON.stringify(lastEmbedContent) != JSON.stringify(NewEmbed) && !lastDown) {
				let Message = await SendEmbed(NewEmbed);
				if (Message) {
					lastMessageId = Message.data.id;
					await RenameChannel(statusNames[worstStatus].emoji + "services-" + statusNames[worstStatus].name);
					if (DownPlatforms.length == 1) {
						await RenameCategory("GTA V - " + statusNames[worstStatus].emoji + " " + DownPlatforms[0].name + " " + statusNames[worstStatus].name);
					} else {
						await RenameCategory("GTA V - " + statusNames[worstStatus].emoji + " Services " + statusNames[worstStatus].name);
					}
				} else  {
					console.log("Error occured, will try to send again next time.");
					return;
				}
			} else if (JSON.stringify(lastEmbedContent) != JSON.stringify(NewEmbed) && lastMessageId != 0) {
				await SendEmbed(NewEmbed, lastMessageId);
				await RenameChannel(statusNames[worstStatus].emoji + "services-" + statusNames[worstStatus].name);
				if (DownPlatforms.length == 1) {
					await RenameCategory("GTA V - " + statusNames[worstStatus].emoji + " " + DownPlatforms[0].name + " " + statusNames[worstStatus].name);
				} else {
					await RenameCategory("GTA V - " + statusNames[worstStatus].emoji + " Services " + statusNames[worstStatus].name);
				}
			}

			lastEmbedContent = NewEmbed;
			lastDown = RSServiceDown || DowndetectorDown;
		
		} else {
			NewEmbed.fields.push({name: "All Services", value: "🟢 Up"});
			NewEmbed.author.name += " 🟢";
			NewEmbed.description = `Services currently appear to be Up.\n\nMore info on [Downdetector](https://downdetector.com/status/gta5/) and [Rockstar's Status Page](https://support.rockstargames.com/servicestatus)`;
			if (JSON.stringify(lastEmbedContent) != JSON.stringify(NewEmbed)) {
				let Message = await SendEmbed(NewEmbed);
				await RenameChannel("🟢services-up");
				await RenameCategory("GTA V");
				lastMessageId = Message.data.id;
			}
			lastDown = false;
			lastEmbedContent = NewEmbed;
		}
	} else {
		console.log("Failed to get R* status, maybe next time?");
	}
}

UpdateStatus();
setInterval(UpdateStatus, config.updateRate);