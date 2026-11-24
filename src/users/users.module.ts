import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { EmployeeLoginController } from './employee-login.controller';
import { EmployeeLoginService } from './employee-login.service';

@Module({
  imports: [AuthModule],
  controllers: [UsersController, EmployeeLoginController],
  providers: [UsersService, EmployeeLoginService],
  exports: [UsersService],
})
export class UsersModule {}
