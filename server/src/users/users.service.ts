import { HttpStatus, Injectable, type OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model, Types } from 'mongoose';
import { ErrorCode } from '@auth-app/shared';
import { isDuplicateKeyError } from '../common/db/mongo-errors.js';
import { AppException } from '../common/exceptions/app.exception.js';
import { User, type UserDocument } from './user.schema.js';

export interface NewUser {
  email: string;
  name: string;
  passwordHash: string;
}

@Injectable()
export class UsersService implements OnModuleInit {
  constructor(@InjectModel(User.name) private readonly users: Model<User>) {}

  /** Builds the unique email index before the first request, so the 409 path is reliable. */
  async onModuleInit(): Promise<void> {
    await this.users.init();
  }

  /** Relies on the unique index (not find-then-insert), so concurrent sign-ups cannot race. */
  async create(data: NewUser): Promise<UserDocument> {
    try {
      return await this.users.create(data);
    } catch (error) {
      if (isDuplicateKeyError(error)) {
        throw new AppException(
          HttpStatus.CONFLICT,
          ErrorCode.EMAIL_TAKEN,
          'Email is already registered',
        );
      }
      throw error;
    }
  }

  findByEmailWithPassword(email: string): Promise<UserDocument | null> {
    return this.users.findOne({ email }).select('+passwordHash').exec();
  }

  findById(id: Types.ObjectId): Promise<UserDocument | null> {
    return this.users.findById(id).exec();
  }
}
