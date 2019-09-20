const crypto = require('crypto')

 const encrypt= async (data ,ENCRYPTION_PASSWORD) =>{
    try {
      // Generate an initialization vector.
      const iv = 'abcdefghijklmnop'

      // Hash the password into a 32 byte string.
      const hash = crypto.createHash('md5')
      hash.update(ENCRYPTION_PASSWORD)
      const key = hash.digest('hex')
      // console.log(`hashed password: ${key}`)

      // Encrypt the input string.
      var cipher = crypto.createCipheriv('aes-256-cbc', key, iv)
      var crypted = cipher.update(data, 'utf8', 'hex')
      crypted += cipher.final('hex')

      return crypted
    } catch (error) {
      console.log('Error in encrypt.js/encrypt()')
      throw error
    }
  }

 const  decrypt= async (data,ENCRYPTION_PASSWORD)=> {
  try {
      // Generate an initialization vector.
      const iv = 'abcdefghijklmnop'

      // Hash the password into a 32 byte string.
      const hash = crypto.createHash('md5')
      hash.update(ENCRYPTION_PASSWORD)
      const key = hash.digest('hex')
      // console.log(`hashed password: ${key}`)

      // Encrypt the input string.
      var decipher = crypto.createDecipheriv('aes-256-cbc', key, iv)
      var decrypted = decipher.update(data, 'hex', 'utf8')
      decrypted += decipher.final('utf8')

      return decrypted
    } catch (error) {
      console.log('Error in encrypt.js/decrypt()')
      throw error
    }
  }

  exports = module.exports = {
    encrypt,
    decrypt
}