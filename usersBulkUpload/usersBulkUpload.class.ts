import { Params, ServiceMethods } from '@feathersjs/feathers';
import { Model } from 'mongoose';
import { BadRequest } from '@feathersjs/errors';
import { LocalStrategy } from '@feathersjs/authentication-local';

import fs from 'fs';
import { Logger } from 'winston';
import { Application, SuccessResponse } from '../../declarations';
import { GendersEnum, UserDocument } from '../../models/user.model';
import { RoleDocument } from '../../models/role.model';
import UsersService from '../users/users.class';
import CustomRegistrationConfigService from '../customRegistrationConfig/customRegistrationConfig.class';
import { UserGroupsService } from '../userGroups/userGroups.class';

export interface CsvUser {
  userName: string;
  password: string;
  fullName: string;
  gender: GendersEnum;
  dateOfBirth: string | Date;
  email?: string | null | undefined;
}

export interface ServiceOptions {
  numberOfFirstErrors: number;
  maxFileSize: number;
  logMetrics: boolean;
}

export type UsersBulkUploadResult = SuccessResponse;

export default class UsersBulkUploadService
  implements Partial<ServiceMethods<UsersBulkUploadResult>> {
  options: ServiceOptions;

  logger: Logger;

  UsersService: UsersService;

  CustomRegistrationConfigService: CustomRegistrationConfigService;

  UserGroupsService: UserGroupsService;

  UserModel: Model<UserDocument>;

  RoleModel: Model<RoleDocument>;

  private readonly localStrategy: LocalStrategy;

  constructor(options: ServiceOptions, app: Application) {
    this.options = options;
    const mongooseClient = app.get('mongooseClient');
    this.logger = app.get('logger');

    this.UsersService = app.service('users');
    this.CustomRegistrationConfigService = app.service(
      'customRegistrationConfig',
    );
    this.UserGroupsService = app.service('userGroups');

    this.UserModel = mongooseClient.models.User;
    this.RoleModel = mongooseClient.models.Role;
    this.localStrategy = app
      .service('authentication')
      .getStrategies('local')[0] as LocalStrategy;
  }

  setup(app: Application) {
    this.CustomRegistrationConfigService = app.service(
      'customRegistrationConfig',
    );
    this.UserGroupsService = app.service('userGroups');
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async create(data: any, params: Params): Promise<UsersBulkUploadResult> {
    let bulkUsers = [];

    const { csvUsers: users, client, group } = data;
    const defConfig = await this.CustomRegistrationConfigService._getDefaultConfig(
      params,
    );
    const candidateRole = await this.RoleModel.findOne({ name: 'Candidate' });
    if (!candidateRole) {
      throw new BadRequest('Candidate role does not exist');
    }
    if (group) {
      await this.UserGroupsService.get(group, {
        query: { client },
        user: params.user,
      });
    }

    bulkUsers = await Promise.all(
      users.map(async (user: CsvUser) => {
        const hashedPassword = await this.localStrategy.hashPassword(
          user.password,
          {},
        );
        return {
          ...user,
          password: hashedPassword,
          role: candidateRole._id,
          config: defConfig,
          client,
          group,
        };
      }),
    );

    try {
      await this.UserModel.create(bulkUsers);
    } catch (err) {
      if (err.code === 11000) {
        throw new BadRequest('User with that userName already exist');
      }
      throw err;
    }

    return { success: true };
  }

  // depends on:
  // poolSize: increasing remove bug
  // await this.RoleModel: comment  this row also remove bug
  // bulkUsers.slice(0, 900): small amount of rows also removes bug
  async createbBugtest(): Promise<[]> {
    let z;
    let bulkUsers: CsvUser[] = [];

    try {
      const candidateRole = await this.RoleModel.findOne({ name: 'Candidate' });
      console.log(candidateRole);

      const json = fs.readFileSync('bulkUsers.json').toString();
      bulkUsers = JSON.parse(json);
      console.log('#### count', bulkUsers.length);
      // bulkUsers = bulkUsers.slice(0, 900);
      console.log('#### count', bulkUsers.length);
      // console.log(bulkUsers);

      z = await this.UserModel.create(bulkUsers);
    } catch (e) {
      this.logger.error('#### MongoError');
      this.logger.error(e);
    }
    console.log(z);
    return [];
  }
}
