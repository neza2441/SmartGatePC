<?php

namespace Database\Seeders;

use App\Models\User;
use App\Models\Computer;
use App\Models\VerificationLog;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;

class DatabaseSeeder extends Seeder
{
    public function run(): void
    {
        if (! app()->isLocal()) {
            return;
        }

        $password = env('SMARTGATE_DEMO_PASSWORD');
        if (! $password) {
            $this->command?->warn('Set SMARTGATE_DEMO_PASSWORD in .env to create local demo accounts.');
            return;
        }

        $student = User::updateOrCreate(['email' => 'alice@smartgate.test'], [
            'name' => 'Alice Mugisha', 'student_id' => 'RP-2023-041', 'role' => 'student', 'password' => Hash::make($password),
        ]);
        $officer = User::updateOrCreate(['email' => 'emmanuel@smartgate.test'], [
            'name' => 'Emmanuel K.', 'student_id' => null, 'role' => 'gate_officer', 'password' => Hash::make($password),
        ]);
        User::updateOrCreate(['email' => 'diane@smartgate.test'], [
            'name' => 'Diane U.', 'student_id' => null, 'role' => 'administrator', 'password' => Hash::make($password),
        ]);

        foreach ([
            ['HP', 'EliteBook 840 G8', '5CD1418K9P', 'verified'],
            ['Apple', 'MacBook Air M2', 'C02ZJ8LWQ6L4', 'pending_review'],
        ] as [$manufacturer, $model, $serial, $status]) {
            Computer::updateOrCreate(['serial_number' => $serial], [
                'user_id' => $student->id,
                'manufacturer' => $manufacturer,
                'model' => $model,
                'status' => $status,
            ]);
        }

        if (! VerificationLog::exists()) {
            $computer = Computer::where('serial_number', '5CD1418K9P')->firstOrFail();
            VerificationLog::create([
                'officer_id' => $officer->id,
                'computer_id' => $computer->id,
                'identifier' => $computer->serial_number,
                'result' => 'verified',
            ]);
        }
    }
}
