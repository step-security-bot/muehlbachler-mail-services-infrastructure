import { dnsConfig, mailConfig, roundcubeConfig } from '../configuration';
import { createRecord } from '../google/dns/record';
import { getMailname } from '../util/mail';

export const MAIL_SERVER_PRIMARY_DOMAIN = `${getMailname(mailConfig.main.name)}.`;

/**
 * Creates the base DNS records.
 */
export const createDNSRecords = () => {
  createRecord(
    roundcubeConfig.domain.name,
    roundcubeConfig.domain.zoneId ?? mailConfig.main.zoneId,
    'CNAME',
    [MAIL_SERVER_PRIMARY_DOMAIN],
    {
      project:
        roundcubeConfig.domain.project ??
        mailConfig.main.project ??
        dnsConfig.project,
    },
  );
};
