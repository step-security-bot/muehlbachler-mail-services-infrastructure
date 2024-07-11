import * as gcp from '@pulumi/gcp';
import { CustomResourceOptions, interpolate } from '@pulumi/pulumi';

import { environment, globalName } from '../../configuration';

import { createIAMMember } from './member';

/**
 * Creates a new service account.
 *
 * @param {string} name the name
 * @param {string[]} roles the roles to add (optional)
 * @param {string} project the project (optional)
 * @returns {gcp.serviceaccount.Account} the service account
 */
export const createServiceAccount = (
  name: string,
  {
    roles,
    project,
    pulumiOptions,
  }: {
    readonly roles?: readonly string[];
    readonly project?: string;
    readonly pulumiOptions?: CustomResourceOptions;
  },
): gcp.serviceaccount.Account => {
  const accountName = `${globalName}-${name}-${environment}`;

  const serviceAccount = new gcp.serviceaccount.Account(
    `gcp-sa-${accountName}`,
    {
      accountId: accountName,
      displayName: `${globalName}/${environment}: ${name}`,
      description: `${globalName}/${environment}: Service Account for ${name}`,
      project: project,
    },
    pulumiOptions,
  );

  if (roles) {
    createIAMMember(
      name,
      interpolate`serviceAccount:${serviceAccount.email}`,
      roles,
      {
        project: project,
        pulumiOptions: pulumiOptions,
      },
    );
  }

  return serviceAccount;
};
