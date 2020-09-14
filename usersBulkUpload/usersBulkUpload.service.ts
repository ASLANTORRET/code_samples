import { ServiceAddons } from '@feathersjs/feathers';
import multer from 'multer';
import { authenticate } from '@feathersjs/express';

import csvToJsonMiddleware from './usersBulkUpload.middlewares';
import { Application } from '../../declarations';
import hooks from './usersBulkUpload.hooks';

import UsersBulkUploadService, {
  ServiceOptions,
  UsersBulkUploadResult,
} from './usersBulkUpload.class';

import {
  fileMappingMiddleware,
  fileSizeCheckMiddleware,
  preventDuplicatedInvoke,
  checkPermissionsMiddleware,
} from '../../middleware';

declare module '../../declarations' {
  interface ServiceTypes {
    usersBulkUpload: UsersBulkUploadService &
      ServiceAddons<UsersBulkUploadResult>;
  }
}

export default (app: Application): void => {
  const config = app.get('config');
  const { usersBulkUpload: serviceOptions } = config;
  const options: ServiceOptions = serviceOptions;
  const multipartMiddleware = multer({
    limits: {
      fileSize: serviceOptions.maxFileSize as number,
    },
  });
  const timestamps = {};
  app.use(
    '/usersBulkUpload',
    preventDuplicatedInvoke(timestamps),
    authenticate('jwt'),
    checkPermissionsMiddleware(app),
    multipartMiddleware.single('file'),
    fileMappingMiddleware,
    fileSizeCheckMiddleware,
    csvToJsonMiddleware,
    new UsersBulkUploadService(options, app),
  );

  const service = app.service('usersBulkUpload');

  service.hooks(hooks);
};
