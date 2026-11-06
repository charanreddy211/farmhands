import { BadRequestException, Body, Controller, Get, Param, Patch, Post, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { randomUUID } from 'node:crypto';
import { rename } from 'node:fs/promises';
import { join } from 'node:path';
import { getImageExtension } from '../image-upload';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { UsersService } from './users.service';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get(':id')
  async findProfile(@Param('id') id: string) {
    return this.toProfileResponse(await this.usersService.findProfile(id));
  }

  @Patch(':id')
  async updateProfile(@Param('id') id: string, @Body() input: UpdateProfileDto) {
    return this.toProfileResponse(await this.usersService.updateProfile(id, input));
  }

  private toProfileResponse(user: Awaited<ReturnType<UsersService['findProfile']>>) {
    const { labourLatitude, labourLongitude, ...profile } = user;
    return {
      ...profile,
      labourLatitude: null,
      labourLongitude: null,
      labourLocationSet: labourLatitude !== null && labourLongitude !== null,
    };
  }

  @Post(':id/profile-image')
  @UseInterceptors(FileInterceptor('file', {
    dest: join(__dirname, '..', '..', 'uploads', 'profile-images'),
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (_request, file, callback) => {
      if (!getImageExtension(file.mimetype)) {
        callback(new BadRequestException('Upload a JPEG, PNG, WebP, or HEIC image.'), false);
        return;
      }
      callback(null, true);
    },
  }))
  async uploadProfileImage(@UploadedFile() file: { path: string; mimetype: string } | undefined) {
    if (!file) throw new BadRequestException('Choose an image to upload.');
    const extension = getImageExtension(file.mimetype);
    if (!extension) throw new BadRequestException('Upload a JPEG, PNG, WebP, or HEIC image.');
    const fileName = `${randomUUID()}${extension}`;
    await rename(file.path, join(__dirname, '..', '..', 'uploads', 'profile-images', fileName));
    return { url: `/uploads/profile-images/${fileName}` };
  }
}
