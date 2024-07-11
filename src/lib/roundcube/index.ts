import { remote } from '@pulumi/command';
import { all, Output, Resource } from '@pulumi/pulumi';
import { FileAsset } from '@pulumi/pulumi/asset';
import { parse } from 'yaml';

import { StringMap } from '../../model/map';
import { PostgresqlUserData } from '../../model/postgresql';
import {
  mailConfig,
  postgresqlConfig,
  roundcubeConfig,
} from '../configuration';
import { getFileHash, readFileContents, writeFileContents } from '../util/file';
import { getMailname } from '../util/mail';
import { writeFilePulumiAndUploadToS3 } from '../util/storage';
import { renderTemplate } from '../util/template';

import { createDNSRecords } from './record';

/**
 * Installs Roundcube.
 *
 * @param {Output<string>} sshIPv4 the SSH IPv4 address
 * @param {Output<string>} sshKey the SSH key
 * @param {StringMap<PostgresqlUserData>} postgresqlUsers the Postgresql users
 * @param {Output<string>} mailcowApiKeyReadWrite the Mailcow read-write API key
 * @param {readonly Resource[]} dependsOn the resources this command depends on
 */
export const installRoundcube = (
  sshIPv4: Output<string>,
  sshKey: Output<string>,
  postgresqlUsers: StringMap<PostgresqlUserData>,
  mailcowApiKeyReadWrite: Output<string>,
  dependsOn: readonly Resource[],
) => {
  createDNSRecords();

  const connection = {
    host: sshIPv4,
    privateKey: sshKey,
    user: 'root',
  };

  const prepare = new remote.Command(
    'remote-command-prepare-roundcube',
    {
      create: readFileContents('./assets/roundcube/prepare.sh'),
      connection: connection,
    },
    {
      dependsOn: [...dependsOn],
    },
  );

  const systemdServiceHash = getFileHash(
    './assets/roundcube/roundcube.service',
  );
  const systemdServiceCopy = new remote.CopyToRemote(
    'remote-copy-roundcube-service',
    {
      source: new FileAsset('./assets/roundcube/roundcube.service'),
      remotePath: '/etc/systemd/system/roundcube.service',
      triggers: [Output.create(systemdServiceHash)],
      connection: connection,
    },
    {
      dependsOn: [...dependsOn, prepare],
    },
  );

  const dockerComposeHash = Output.create(
    renderTemplate('./assets/roundcube/docker-compose.yml.j2', {
      domain: roundcubeConfig.domain.name,
    }),
  )
    .apply((content) =>
      writeFileContents('./outputs/roundcube_docker-compose.yml', content, {}),
    )
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    .apply((_) => getFileHash('./outputs/roundcube_docker-compose.yml'));
  const dockerComposeCopy = dockerComposeHash.apply(
    (hash) =>
      new remote.CopyToRemote(
        'remote-copy-roundcube-docker-compose',
        {
          source: new FileAsset('./outputs/roundcube_docker-compose.yml'),
          remotePath: '/opt/roundcube/docker-compose.yml',
          triggers: [Output.create(hash)],
          connection: connection,
        },
        {
          dependsOn: [...dependsOn, prepare],
        },
      ),
  );

  const nginxConfHash = getFileHash('./assets/roundcube/nginx.conf');
  const nginxConfCopy = new remote.CopyToRemote(
    'remote-copy-roundcube-nginx',
    {
      source: new FileAsset('./assets/roundcube/nginx.conf'),
      remotePath: '/opt/roundcube/nginx.conf',
      triggers: [Output.create(nginxConfHash)],
      connection: connection,
    },
    {
      dependsOn: [...dependsOn, prepare],
    },
  );

  const configFileHash = all([
    postgresqlUsers['roundcube'].password,
    postgresqlConfig.address,
  ])
    .apply(([dbPassword, dbHost]) =>
      renderTemplate('./assets/roundcube/custom.inc.php.j2', {
        mailname: getMailname(mailConfig.main.name),
        domain: roundcubeConfig.domain.name,
        db: {
          host: dbHost,
          database: 'roundcube',
          user: 'roundcube',
          password: dbPassword,
        },
      }),
    )
    .apply((content) =>
      writeFilePulumiAndUploadToS3(
        'roundcube_custom.inc.php',
        Output.create(content),
        {},
      ),
    )
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    .apply((_) => getFileHash('./outputs/roundcube_custom.inc.php'));
  const configFileCopy = configFileHash.apply(
    (hash) =>
      new remote.CopyToRemote(
        'remote-copy-roundcube-custom-conf',
        {
          source: new FileAsset('./outputs/roundcube_custom.inc.php'),
          remotePath: '/opt/roundcube/config/custom.inc.php',
          triggers: [Output.create(hash)],
          connection: connection,
        },
        {
          dependsOn: [...dependsOn, prepare],
        },
      ),
  );

  const roundcubeVersion = dockerComposeHash.apply(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    (_) =>
      parse(readFileContents('./outputs/roundcube_docker-compose.yml'))[
        'services'
      ]['webmail']['image'].split(':')[1],
  );

  const installCommand = roundcubeVersion.apply((version) =>
    renderTemplate('./assets/roundcube/install.sh.j2', {
      version: version,
    }),
  );
  const installTask = all([dockerComposeCopy, configFileCopy]).apply(
    ([composeCopy, configCopy]) =>
      new remote.Command(
        'remote-command-install-roundcube',
        {
          create: installCommand,
          update: installCommand,
          triggers: [
            systemdServiceHash,
            dockerComposeHash,
            configFileHash,
            roundcubeVersion,
          ],
          connection: connection,
        },
        {
          dependsOn: [
            ...dependsOn,
            prepare,
            systemdServiceCopy,
            composeCopy,
            nginxConfCopy,
            configCopy,
          ],
        },
      ),
  );

  const passwordPluginHash = mailcowApiKeyReadWrite
    .apply((apiToken) =>
      renderTemplate('./assets/roundcube/password.inc.php.j2', {
        mailname: getMailname(mailConfig.main.name),
        apiToken: apiToken,
      }),
    )
    .apply((content) =>
      writeFilePulumiAndUploadToS3(
        'roundcube_password.inc.php',
        Output.create(content),
        {},
      ),
    )
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    .apply((_) => getFileHash('./outputs/roundcube_password.inc.php'));
  const passwordPluginCopy = installTask.apply(
    (installer) =>
      new remote.CopyToRemote(
        'remote-copy-roundcube-password-plugin-conf',
        {
          source: new FileAsset('./outputs/roundcube_password.inc.php'),
          remotePath: '/opt/roundcube/www/plugins/password/config.inc.php',
          triggers: [Output.create(passwordPluginHash)],
          connection: connection,
        },
        {
          dependsOn: [...dependsOn, prepare, installer],
        },
      ),
  );

  all([passwordPluginCopy, installTask]).apply(
    ([passwordCopy, installer]) =>
      new remote.Command(
        'remote-command-postinstall-roundcube',
        {
          create: readFileContents('./assets/roundcube/postinstall.sh'),
          update: readFileContents('./assets/roundcube/postinstall.sh'),
          triggers: [passwordPluginHash],
          connection: connection,
        },
        {
          dependsOn: [...dependsOn, prepare, passwordCopy, installer],
        },
      ),
  );
};
