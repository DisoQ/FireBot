import { FireMessage } from "@fire/lib/extensions/message";
import { FireTextChannel } from "@fire/lib/extensions/textchannel";
import { constants } from "@fire/lib/util/constants";
import { Listener } from "@fire/lib/util/listener";
import Filters from "@fire/src/modules/filters";
import MCLogs from "@fire/src/modules/mclogs";
import { Snowflake } from "discord-api-types/globals";

const { regexes } = constants;

const cleanMap = {
  ":": [/\\:/gim],
  ".": [
    /\\\./gim,
    /\(\.\)/gim,
    /dot/gim,
    /\/\./gim,
    /\[\.\]/gim,
    /\s+\./gim,
    /\.\s+/gim,
  ],
  "/": [/\.\//gim, /\\\/\//gim, /\\\//gim, /slash/gim, /\\/gim, /\s\//gim],
  "": [regexes.zws, regexes.protocol, regexes.symbol, /(\*|_|\|)/gim],
  com: [/c.m/gim],
  ".com": [/\scom/gim, /\.c\.o\.m/gim, /com\s/gim],
  "discord.gg/$1": [/(^|\s)\.gg(?:\/|\\)(?<code>[\w-]{1,25})[^\/]?/gim],
  // always keep this at the end
  "/ lets be honest there is no reason to post this other than trying to send rick roll so lol, youtu.be/dQw4w9WgXcQ":
    [/\/(?:watch\?v=)?dQw4w9WgXcQ/gim],
};

const safeDecodeURI = (encodedURI: string) => {
  try {
    return decodeURI(encodedURI);
  } catch {
    return encodedURI;
  }
};

const safeDecodeURIComponent = (encodedURIComponent: string) => {
  try {
    return decodeURIComponent(encodedURIComponent);
  } catch {
    return encodedURIComponent;
  }
};

const babyMobEmojis = [
  "1486015710894231702",
  "1486015734877257890",
  "1486015765495939183",
  "1486015787712909423",
  "1486015810563608686",
  "1486015837239509174",
  "1486015860794720266",
  "1486015900862906549",
  "1486015926221672500",
  "1486015950582190220",
  "1486015974455906415",
  "1486016018139578458",
  "1486016043590615181",
  "1486016067439689729",
  "1486016088159293470",
  "1486016108304666714",
  "1486016129041170702",
  "1486016147789840434",
  "1486016164604678314",
  "1486016184745852988",
  "1486016206916943872",
  "1486016228186128384",
  "1486016247178068028",
  "1486016268921208884",
  "1486016299611197582",
  "1486016321434026076",
  "1486016346696454318",
  "1486016367403733183",
  "1486016393467134124",
  "1486016414484664390",
  "1486016437272182784",
  "1486016470243610634",
  "1486016494708981860",
  "1486016516850847935",
  "1486016535096066098",
  "1486016557812547615",
  "1486016580063330376",
  "1486016598581051544",
  "1486016617623191624",
];

export default class Message extends Listener {
  recentTokens: string[];
  tokenRegex: RegExp;

  constructor() {
    super("message", {
      emitter: "client",
      event: "messageCreate",
    });
  }

  async exec(message: FireMessage) {
    if (this.client.manager.id != 0 && !message.guild) return;

    if (message.type == "CHANNEL_PINNED_MESSAGE")
      this.client.emit("channelPinsAdd", message.reference, message.member);

    const mcLogsModule = this.client.getModule("mclogs") as MCLogs;
    // These won't run if the modules aren't loaded
    await mcLogsModule?.checkLogs(message).catch(() => {});

    // Ensures people get dehoisted/decancered even if
    // Fire missed them joining/changing name
    if (message.member) {
      // This will check permissions & whether
      // dehoist/decancer is enabled so no need for checks here
      message.member.dehoistAndDecancer();
    }

    await message.runAntiFilters().catch(() => {});
    await message.runPhishFilters().catch(() => {});

    if (!message.member || message.author.bot) return;

    if (
      message.guildId == "864592657572560958" &&
      message.attachments.some((attach) => attach.name.endsWith(".zip")) &&
      (message.channel as FireTextChannel).parentId != "1033867272260943893" &&
      (message.channel as FireTextChannel).parentId != "1033869240274526311" &&
      (message.channel as FireTextChannel).parentId != "1033869280938307625" &&
      !message.member.isModerator()
    )
      return await message.delete().catch(() => {});
    else if (
      message.channelId == "1486403295684853882" &&
      message.guild?.settings.get<boolean>("tinytakeover.delete", false)
    ) {
      const emojis = message.content.matchAll(regexes.customEmoji);
      if (
        !Array.from(emojis).length ||
        !emojis.every((match) => babyMobEmojis.includes(match.groups?.id))
      )
        return await message.delete().catch(() => {});
    }

    const autoroleId = message.guild.settings.get<Snowflake>(
      "mod.autorole",
      null
    );
    if (autoroleId && (message.type == "DEFAULT" || message.type == "REPLY")) {
      const role = message.guild.roles.cache.get(autoroleId);
      if (role && !message.member.roles.cache.has(role.id))
        await message.member.roles
          .add(role, message.member.guild.language.get("AUTOROLE_REASON"))
          .catch(() => {});
    }

    const filters = this.client.getModule("filters") as Filters;
    await filters?.runAll(message, this.cleanContent(message)).catch(() => {});
  }

  cleanContent(message: FireMessage, includeEmbeds = true): string {
    if (message.embeds.length && includeEmbeds)
      message.embeds = message.embeds.map((embed) => {
        // normalize urls
        if (embed.url) embed.url = safeDecodeURI(new URL(embed.url).toString());
        if (embed.thumbnail?.url)
          embed.thumbnail.url = safeDecodeURI(
            new URL(embed.thumbnail.url).toString()
          );
        if (embed.author?.url)
          embed.author.url = safeDecodeURI(
            new URL(embed.author.url).toString()
          );
        return embed;
      });

    let content = message.cleanContent;

    let match: RegExpExecArray;
    while ((match = regexes.basicURL.exec(content)))
      if (match?.length)
        try {
          const uri = new URL(match[0]);
          content = content.replace(
            match[0],
            safeDecodeURIComponent(uri.toString())
          );
        } catch {}

    for (const [replacement, regexes] of Object.entries(cleanMap))
      for (const regex of regexes)
        content = content.replace(regex, replacement);

    return this.client.util.sanitizer(content, content);
  }
}
