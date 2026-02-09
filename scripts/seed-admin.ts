import 'dotenv/config'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../prisma/generated/prisma/client'
import bcrypt from 'bcryptjs'

const connectionString = `${process.env.DATABASE_URL}`
const adapter = new PrismaPg({ connectionString })
const prisma = new PrismaClient({ adapter })

async function main() {
  const email = 'admin@admin.com'
  const password = 'Password@123'

  // Check if admin user already exists
  const existingUser = await prisma.user.findUnique({
    where: { email },
  })

  if (existingUser) {
    console.log(`User with email ${email} already exists. Updating to admin role...`)
    
    // Update existing user to admin role and update password
    const passwordHash = await bcrypt.hash(password, 10)
    await prisma.user.update({
      where: { email },
      data: {
        role: 'ADMIN',
        passwordHash,
      },
    })
    console.log(`✅ Updated user ${email} to ADMIN role with new password`)
  } else {
    // Create new admin user
    const passwordHash = await bcrypt.hash(password, 10)
    const user = await prisma.user.create({
      data: {
        email,
        passwordHash,
        role: 'ADMIN',
      },
    })
    console.log(`✅ Created admin user: ${email}`)
    console.log(`   User ID: ${user.id}`)
  }
}

main()
  .catch((e) => {
    console.error('❌ Error seeding admin user:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })

