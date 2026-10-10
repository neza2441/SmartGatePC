<?php

namespace Tests\Feature;

use App\Models\Computer;
use App\Models\User;
use App\Models\VerificationLog;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class SmartGateApiTest extends TestCase
{
    use RefreshDatabase;

    public function test_student_can_register_a_device_with_a_signed_qr_token(): void
    {
        $student = $this->user('student');

        $response = $this->actingAs($student)->postJson('/api/devices', [
            'manufacturer' => 'HP',
            'model' => 'EliteBook 840',
            'serial_number' => '  abcde-12345  ',
        ]);

        $response->assertCreated()
            ->assertJsonPath('data.status', 'Pending review')
            ->assertJsonPath('data.serial', 'ABCDE-12345');

        $computer = Computer::firstOrFail();
        $this->assertStringStartsWith('SG1.', $computer->qrCodeToken());
        $this->assertStringNotContainsString($computer->serial_number, $computer->qrCodeToken());
    }

    public function test_gate_officer_verification_logs_the_officer_and_rejects_tampered_tokens(): void
    {
        $student = $this->user('student');
        $officer = $this->user('gate_officer');
        $computer = Computer::create([
            'user_id' => $student->id,
            'manufacturer' => 'Dell',
            'model' => 'Latitude 5420',
            'serial_number' => 'DELL-123456',
            'status' => 'verified',
        ]);

        $this->actingAs($officer)->postJson('/api/gate/verify', ['identifier' => $computer->qrCodeToken()])
            ->assertOk()
            ->assertJsonPath('status', 'verified')
            ->assertJsonPath('device.serial', 'DELL-123456');

        $this->assertDatabaseHas('verification_logs', [
            'officer_id' => $officer->id,
            'computer_id' => $computer->id,
            'result' => 'verified',
        ]);

        $this->postJson('/api/gate/verify', ['identifier' => $computer->qrCodeToken().'tampered'])
            ->assertJsonPath('status', 'not_registered');
    }

    public function test_only_administrators_can_review_devices(): void
    {
        $student = $this->user('student');
        $officer = $this->user('gate_officer');
        $computer = Computer::create([
            'user_id' => $student->id,
            'manufacturer' => 'Lenovo',
            'model' => 'ThinkPad T14',
            'serial_number' => 'LENOVO-1234',
        ]);

        $this->actingAs($officer)->patchJson("/api/admin/devices/{$computer->id}/status", ['status' => 'verified'])
            ->assertForbidden();
    }

    public function test_administrator_can_list_and_create_users_across_roles(): void
    {
        $administrator = $this->user('administrator');
        $this->user('student');
        $this->user('gate_officer');

        $this->actingAs($administrator)->getJson('/api/admin/users')
            ->assertOk()
            ->assertJsonCount(3, 'data')
            ->assertJsonFragment(['role' => 'student'])
            ->assertJsonFragment(['role' => 'gate_officer'])
            ->assertJsonFragment(['role' => 'administrator']);

        $this->postJson('/api/admin/users', [
            'name' => 'New Gate Officer',
            'email' => 'new-officer@smartgate.test',
            'password' => 'Test-password-2026!',
            'role' => 'gate_officer',
        ])->assertCreated()
            ->assertJsonPath('data.role', 'gate_officer')
            ->assertJsonPath('data.student_id', null);

        $this->assertDatabaseHas('users', ['email' => 'new-officer@smartgate.test', 'role' => 'gate_officer']);
    }

    public function test_only_administrators_can_manage_users(): void
    {
        $student = $this->user('student');

        $this->actingAs($student)->getJson('/api/admin/users')->assertForbidden();
    }

    public function test_administrator_can_edit_a_pc_and_delete_it_without_deleting_its_audit_log(): void
    {
        $administrator = $this->user('administrator');
        $student = $this->user('student');
        $officer = $this->user('gate_officer');
        $computer = Computer::create([
            'user_id' => $student->id,
            'manufacturer' => 'Dell',
            'model' => 'Latitude 5420',
            'serial_number' => 'DELL-123456',
        ]);
        $log = VerificationLog::create([
            'officer_id' => $officer->id,
            'computer_id' => $computer->id,
            'identifier' => $computer->serial_number,
            'result' => 'verified',
        ]);

        $this->actingAs($administrator)->patchJson("/api/admin/devices/{$computer->id}", [
            'user_id' => $student->id,
            'manufacturer' => 'HP',
            'model' => 'EliteBook 840',
            'serial_number' => ' hp-123456 ',
            'status' => 'verified',
        ])->assertOk()
            ->assertJsonPath('data.brand', 'HP')
            ->assertJsonPath('data.serial', 'HP-123456')
            ->assertJsonPath('data.status', 'Verified');

        $this->deleteJson("/api/admin/devices/{$computer->id}")->assertOk();
        $this->assertDatabaseMissing('computers', ['id' => $computer->id]);
        $this->assertDatabaseHas('verification_logs', ['id' => $log->id, 'computer_id' => null]);
    }

    public function test_administrator_can_edit_and_delete_a_user_without_a_student_id(): void
    {
        $administrator = $this->user('administrator');
        $target = $this->user('gate_officer');

        $this->actingAs($administrator)->patchJson("/api/admin/users/{$target->id}", [
            'name' => 'Updated Officer',
            'email' => 'updated-officer@smartgate.test',
            'student_id' => null,
            'role' => 'gate_officer',
            'password' => '',
        ])->assertOk()
            ->assertJsonPath('data.name', 'Updated Officer')
            ->assertJsonPath('data.student_id', null);

        $this->deleteJson("/api/admin/users/{$target->id}")->assertOk();
        $this->assertDatabaseMissing('users', ['id' => $target->id]);
    }

    public function test_administrator_cannot_delete_the_active_or_last_administrator(): void
    {
        $administrator = $this->user('administrator');

        $this->actingAs($administrator)->deleteJson("/api/admin/users/{$administrator->id}")
            ->assertUnprocessable();
        $this->deleteJson("/api/admin/users/{$administrator->id}")
            ->assertUnprocessable();
        $this->assertDatabaseHas('users', ['id' => $administrator->id]);
    }

    public function test_logout_revokes_the_bearer_token(): void
    {
        $officer = $this->user('gate_officer');
        $token = $officer->createToken('test-session')->plainTextToken;
        $tokenId = (int) explode('|', $token, 2)[0];

        $this->withToken($token)->deleteJson('/api/auth/logout')->assertOk();
        $this->assertDatabaseMissing('personal_access_tokens', ['id' => $tokenId]);
    }

    public function test_unauthenticated_api_requests_return_json_unauthorized(): void
    {
        $this->get('/api/auth/me')->assertUnauthorized()->assertJsonPath('message', 'Unauthenticated.');
    }

    public function test_user_can_edit_their_own_profile_without_changing_their_role(): void
    {
        $student = $this->user('student');

        $this->actingAs($student)->patchJson('/api/auth/profile', [
            'name' => 'Updated Student',
            'email' => 'updated-student@smartgate.test',
            'student_id' => 'RP-UPDATED-01',
            'password' => 'New-test-password-2026!',
            'password_confirmation' => 'New-test-password-2026!',
            'role' => 'administrator',
        ])->assertOk()
            ->assertJsonPath('user.name', 'Updated Student')
            ->assertJsonPath('user.email', 'updated-student@smartgate.test')
            ->assertJsonPath('user.student_id', 'RP-UPDATED-01')
            ->assertJsonPath('user.role', 'student');

        $this->assertTrue(Hash::check('New-test-password-2026!', $student->fresh()->password));
    }

    private function user(string $role): User
    {
        static $number = 0;
        $number++;

        return User::create([
            'name' => ucfirst(str_replace('_', ' ', $role)),
            'email' => "{$role}{$number}@smartgate.test",
            'student_id' => $role === 'student' ? "RP-TEST-{$number}" : null,
            'role' => $role,
            'password' => Hash::make('Test-password-2026!'),
        ]);
    }
}