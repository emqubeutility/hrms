import { Module, MiddlewareConsumer, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { PrismaModule } from './prisma/prisma.module';
import { HealthModule } from './health/health.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { RbacModule } from './rbac/rbac.module';
import { MastersModule } from './masters/masters.module';
import { EmployeesModule } from './employees/employees.module';
import { EmployeeProfileModule } from './employee-profile/employee-profile.module';
import { DocumentsModule } from './documents/documents.module';
import { SystemAdminModule } from './system-admin/system-admin.module';
import { BranchesModule } from './branches/branches.module';
import { AttendanceSetupModule } from './attendance-setup/attendance-setup.module';
import { AttendanceModule } from './attendance/attendance.module';
import { LeaveModule } from './leave/leave.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { BulkUpdateModule } from './bulk-update/bulk-update.module';
import { OvertimeModule } from './overtime/overtime.module';
import appConfig from './config/app.config';

import { CommonModule } from './common/common.module';
import { LoggerModule } from './common/logger/logger.module';
import { LoggerContextMiddleware } from './common/logger/logger-context.middleware';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, load: [appConfig] }),
    ScheduleModule.forRoot(),
    CommonModule,
    LoggerModule,
    PrismaModule,
    HealthModule,
    AuthModule,
    UsersModule,
    RbacModule,
    MastersModule,
    EmployeesModule,
    EmployeeProfileModule,
    DocumentsModule,
    SystemAdminModule,
    BranchesModule,
    AttendanceSetupModule,
    AttendanceModule,
    LeaveModule,
    DashboardModule,
    BulkUpdateModule,
    OvertimeModule,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(LoggerContextMiddleware).forRoutes('*');
  }
}
