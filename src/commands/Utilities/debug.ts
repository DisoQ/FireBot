import { SlashCommandMessage } from "@fire/lib/extensions/slashCommandMessage";
import { PermissionString, GuildChannel, MessageEmbed } from "discord.js";
import { FireMessage } from "@fire/lib/extensions/message";
import { constants } from "@fire/lib/util/constants";
import { Language } from "@fire/lib/util/language";
import { Command } from "@fire/lib/util/command";
import * as moment from "moment";
import { FireMember } from "@fire/lib/extensions/guildmember";

const {
  emojis: { success, error },
} = constants;

export default class Debug extends Command {
  constructor() {
    super("debug", {
      description: (language: Language) =>
        language.get("DEBUG_COMMAND_DESCRIPTION"),
      args: [
        {
          id: "command",
          type: "command",
          default: null,
          required: true,
        },
      ],
      enableSlashCommand: true,
      restrictTo: "all",
    });
  }

  async exec(message: FireMessage, args: { command: Command }) {
    const cmd = args.command;
    const channel =
      message instanceof SlashCommandMessage
        ? message.realChannel
        : message.channel;

    if (!cmd) return await this.sendSingleError(message, "DEBUG_NO_COMMAND");
    if (!cmd.id) return await this.sendSingleError(message, "UNKNOWN_COMMAND");
    if (cmd.id == this.id)
      return await this.sendSingleSuccess(message, "DEBUGGING_DEBUG");
    if (moment(new Date()).diff(message.author.createdAt) < 86400000)
      return await this.sendSingleError(message, "COMMAND_ACCOUNT_TOO_YOUNG");
    if (cmd.ownerOnly && !this.client.isOwner(message.author))
      return await this.sendSingleError(message, "COMMAND_OWNER_ONLY");
    if (cmd.superuserOnly && !message.author.isSuperuser())
      return await this.sendSingleError(message, "COMMAND_SUPERUSER_ONLY");
    if (cmd.moderatorOnly && !message.member?.isModerator())
      return await this.sendSingleError(message, "COMMAND_MODERATOR_ONLY");
    if (cmd.channel == "guild" && !message.guild)
      return await this.sendSingleError(
        message,
        "COMMAND_GUILD_ONLY",
        this.client.config.inviteLink
      );
    if (cmd.guilds.length && !cmd.guilds.includes(message.guild?.id))
      return await this.sendSingleError(message, "COMMAND_GUILD_LOCKED");
    if (cmd.premium && !message.guild?.premium)
      return await this.sendSingleError(message, "COMMAND_PREMIUM_GUILD_ONLY");

    const requiresExperiment = cmd.requiresExperiment;
    if (requiresExperiment) {
      const experiment = this.client.experiments.get(requiresExperiment.id);
      if (!experiment)
        return await this.sendSingleError(
          message,
          "COMMAND_EXPERIMENT_REQUIRED"
        );
      else if (
        experiment.kind == "user" &&
        !message.author.hasExperiment(
          experiment.id,
          requiresExperiment.treatmentId
        )
      )
        return await this.sendSingleError(
          message,
          "COMMAND_EXPERIMENT_REQUIRED"
        );
      else if (
        experiment.kind == "guild" &&
        (!message.guild ||
          !message.guild?.hasExperiment(
            experiment.id,
            requiresExperiment.treatmentId
          ))
      )
        return await this.sendSingleError(
          message,
          "COMMAND_EXPERIMENT_REQUIRED"
        );
    }

    const details: string[] = [];
    const permissionChecks = await this.client.commandHandler.runPermissionChecks(
      message,
      cmd
    );

    const clientPermissions = cmd.clientPermissions as PermissionString[];
    const userPermissions = cmd.userPermissions as PermissionString[];

    if (permissionChecks && message.guild) {
      const userMissing = userPermissions
        .filter((permission) => !message.member?.permissions.has(permission))
        .map((permission) =>
          this.client.util.cleanPermissionName(permission, message.language)
        );

      const clientMissing = clientPermissions
        .filter((permission) => !message.guild.me?.permissions.has(permission))
        .map((permission) =>
          this.client.util.cleanPermissionName(permission, message.language)
        );

      const permMsg = message.language.get(
        "DEBUG_PERMS_FAIL",
        userMissing,
        clientMissing
      ) as { user: string | null; client: string | null };

      if (userMissing || clientMissing)
        details.push(
          `${error} ${message.language.get("DEBUG_PERMS_CHECKS_FAIL")}` +
            (permMsg.user ? `\n${permMsg.user}` : "") +
            (permMsg.client ? `\n${permMsg.client}` : "")
        );
    } else if (permissionChecks)
      details.push(`${error} ${message.language.get("DEBUG_REQUIRES_PERMS")}`);
    else details.push(`${success} ${message.language.get("DEBUG_PERMS_PASS")}`);

    const disabledCommands: string[] =
      message.guild?.settings.get("disabled.commands", []) || [];

    if (disabledCommands.includes(cmd.id)) {
      if (message.member?.permissions.has("MANAGE_MESSAGES"))
        details.push(
          `${success} ${message.language.get("DEBUG_COMMAND_DISABLE_BYPASS")}`
        );
      else
        details.push(
          `${error} ${message.language.get("DEBUG_COMMAND_DISABLE")}`
        );
    } else if (message.guild)
      details.push(
        `${success} ${message.language.get("DEBUG_COMMAND_NOT_DISABLED")}`
      );

    if (cmd.id == "mute" && message.guild && channel instanceof GuildChannel) {
      const canSend = channel.permissionOverwrites
        .filter((overwrite) => overwrite.allow.has("SEND_MESSAGES"))
        .map((overwrite) => overwrite.id);
      const roles = [
        ...canSend
          .map((id) => message.guild.roles.cache.get(id))
          .filter((role) => !!role),
        ...message.guild.roles.cache
          .filter(
            (role) =>
              role.permissions.has("ADMINISTRATOR") &&
              !canSend.find((id) => id == role.id)
          )
          .values(),
      ];
      const memberIds = canSend.filter(
        (id) => !roles.find((role) => role.id == id)
      );
      // owner can always bypass
      memberIds.push(message.guild.ownerID);
      const members: string[] = memberIds.length
        ? await message.guild.members
            .fetch({ user: memberIds })
            .then((found) =>
              found.map((member: FireMember) => member.toMention())
            )
            .catch(() => [])
        : [];

      const bypass = [...roles, ...members];

      if (bypass.length > 0)
        details.push(
          `${error} ${message.language.get(
            "DEBUG_MUTE_BYPASS",
            channel.toString(),
            bypass
          )}`
        );
      else
        details.push(
          `${success} ${message.language.get(
            "DEBUG_MUTE_NO_BYPASS",
            channel.toString()
          )}`
        );
    }

    if (
      !message.guild ||
      (message.guild && message.guild.me?.permissions.has("EMBED_LINKS"))
    )
      return await channel.send(this.createEmbed(message, details));
    else {
      details.push(`${error} ${message.language.get("DEBUG_NO_EMBEDS")}`);
      return await channel.send(details.join("\n"));
    }
  }

  private createEmbed(message: FireMessage, details: string[]) {
    const issues = details.filter((detail) => detail.startsWith(error));
    return new MessageEmbed()
      .setTitle(message.language.get("DEBUG_ISSUES", issues))
      .setColor(message.member?.displayHexColor || "#ffffff")
      .setTimestamp()
      .setDescription(details.join("\n"));
  }

  private async sendSingleError(
    message: FireMessage,
    key: string,
    ...args: any[]
  ) {
    return await message.channel.send({
      embed: this.createEmbed(message, [
        `${error} ${message.language.get(key, ...args)}`,
      ]),
    });
  }

  private async sendSingleSuccess(
    message: FireMessage,
    key: string,
    ...args: any[]
  ) {
    return await message.channel.send({
      embed: this.createEmbed(message, [
        `${success} ${message.language.get(key, ...args)}`,
      ]),
    });
  }
}
