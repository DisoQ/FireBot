import { ApplicationCommandMessage } from "@fire/lib/extensions/appcommandmessage";
import { FireMember } from "@fire/lib/extensions/guildmember";
import { Command } from "@fire/lib/util/command";
import { Language } from "@fire/lib/util/language";
import { PermissionFlagsBits } from "discord-api-types/v9";

export default class TempMediaPerms extends Command {
  constructor() {
    super("temp-media-perms", {
      description: (language: Language) =>
        language.get("TEMP_MEDIA_PERMS_COMMAND_DESCRIPTION"),
      args: [
        {
          id: "user",
          type: "member",
          description: (language: Language) =>
            language.get("TEMP_MEDIA_PERMS_ARGUMENT_USER_DESCRIPTION"),
          default: undefined,
          required: true,
        },
      ],
      guilds: ["864592657572560958"],
      enableSlashCommand: true,
      restrictTo: "guild",
      moderatorOnly: true,
      slashOnly: true,
      ephemeral: true,
    });
  }

  async run(command: ApplicationCommandMessage, args: { user: FireMember }) {
    if (!args.user) return await command.error("TEMP_MEDIA_PERMS_MISSING_USER");
    if (
      args.user.permissions.has(
        PermissionFlagsBits.AttachFiles | PermissionFlagsBits.EmbedLinks
      )
    )
      return await command.error("TEMP_MEDIA_PERMS_ALREADY_HAS");

    const role = command.guild.roles.cache.find(
      (role) => role.name == "TEMP MEDIA PERMISSIONS"
    );
    const added = await args.user.roles
      .add(
        role,
        command.language.get("TEMP_MEDIA_PERMS_REASON", {
          author: `${command.author} (${command.author.id})`,
        })
      )
      .catch(() => {});
    if (!added) return await command.error("COMMAND_ERROR_500");
    else
      setTimeout(() => {
        args.user.roles.remove(
          role,
          command.language.get("TEMP_MEDIA_PERMS_REASON", {
            author: `${command.author} (${command.author.id})`,
          })
        );
      }, 120_000);
  }
}
