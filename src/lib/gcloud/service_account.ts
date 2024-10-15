import { interpolate } from '@pulumi/pulumi';

import { ServiceAccountData } from '../../model/google/service_account_data';
import { backupBucketId, dnsConfig } from '../configuration';
import { createIAMMember } from '../google/iam/member';
import { createGCPServiceAccountAndKey } from '../util/google/service_account_user';

import { createGCSIAMMember } from './gcs_iam_member';

/**
 * Creates the Google Cloud service account for Traefik.
 *
 * @returns {ServiceAccountData} the generated service account
 */
export const createServiceAccount = (): ServiceAccountData => {
  const iam = createGCPServiceAccountAndKey('mail', {});

  iam.serviceAccount.email.apply((email) => {
    createGCSIAMMember(
      backupBucketId,
      `serviceAccount:${email}`,
      'roles/storage.objectAdmin',
    );
    createGCSIAMMember(
      backupBucketId,
      `serviceAccount:${email}`,
      'roles/storage.legacyBucketReader',
    );
  });

  createIAMMember(
    'mail-dns-admin',
    interpolate`serviceAccount:${iam.serviceAccount.email}`,
    ['roles/dns.admin'],
    { project: dnsConfig.project },
  );

  return iam;
};
