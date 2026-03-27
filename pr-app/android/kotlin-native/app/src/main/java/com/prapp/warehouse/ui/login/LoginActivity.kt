package com.prapp.warehouse.ui.login

import android.content.Intent
import android.os.Bundle
import android.view.View
import android.widget.Button
import android.widget.ProgressBar
import android.widget.Toast
import android.widget.EditText
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.ViewModelProvider
import com.prapp.warehouse.R
import com.prapp.warehouse.ui.main.MainActivity
import com.prapp.warehouse.utils.NetworkResult
import com.prapp.warehouse.utils.SharedPrefsManager

class LoginActivity : AppCompatActivity() {

    private lateinit var editServer: EditText
    private lateinit var editUser: EditText
    private lateinit var editPass: EditText
    private lateinit var editApiKey: EditText
    private lateinit var btnLogin: Button
    private lateinit var progressBar: ProgressBar
    private lateinit var viewModel: LoginViewModel

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        
        // Check if already logged in
        val prefs = SharedPrefsManager(this)
        if (prefs.getServerUrl() != null && prefs.getUsername() != null) {
            startActivity(Intent(this, MainActivity::class.java))
            finish()
            return
        }

        setContentView(R.layout.activity_login)

        viewModel = ViewModelProvider(this)[LoginViewModel::class.java]

        editServer = findViewById(R.id.edit_server)
        editUser = findViewById(R.id.edit_username)
        editPass = findViewById(R.id.edit_password)
        editApiKey = findViewById(R.id.edit_apikey)
        btnLogin = findViewById(R.id.btn_login)
        progressBar = findViewById(R.id.progress_login)

        // Pre-fill default server and credentials from the Web App environment
        editServer.setText("https://my432407-api.s4hana.cloud.sap/") 
        editUser.setText("ODS_COMM_USER")
        editPass.setText("NyAXndoxKbW6=TTW\\#9]S\\afQt4u{TxM9c<fe4NS")

        btnLogin.setOnClickListener {
            val server = editServer.text.toString()
            val client = "100" // Hardcoded to match web app behavior where it's not needed/visible
            val user = editUser.text.toString()
            val pass = editPass.text.toString()
            val apiKey = editApiKey.text.toString()
            
            // If we implement API keys fully in Android we would pass it here, 
            // for now use the existing login function which accepts client 100
            viewModel.login(server, client, user, pass)
        }

        viewModel.loginResult.observe(this) { result ->
            when (result) {
                is NetworkResult.Loading<*> -> {
                    progressBar.visibility = View.VISIBLE
                    btnLogin.isEnabled = false
                }
                is NetworkResult.Success<*> -> {
                    progressBar.visibility = View.GONE
                    btnLogin.isEnabled = true
                    Toast.makeText(this, "Login Successful", Toast.LENGTH_SHORT).show()
                    startActivity(Intent(this, MainActivity::class.java))
                    finish()
                }
                is NetworkResult.Error<*> -> {
                    progressBar.visibility = View.GONE
                    btnLogin.isEnabled = true
                    Toast.makeText(this, result.message, Toast.LENGTH_LONG).show()
                }
            }
        }
    }
}
